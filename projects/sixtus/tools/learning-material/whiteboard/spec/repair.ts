import type { SpecRepair } from "./index.ts";
import type { GeneratedBoard } from "./schema.ts";
import { record, type SpecIssue, WhiteboardSpecError } from "./validation.ts";

const startsWith = (path: (string | number)[], prefix: (string | number)[]) =>
  prefix.every((key, i) => path[i] === key);

/** Preserve unaffected content, including on a syntactically valid but semantically invalid board. */
export function assertRepairPreservesContent(
  repair: SpecRepair,
  corrected: GeneratedBoard,
): void {
  let previous = repair.previous;
  if (typeof previous === "string") {
    try {
      previous = JSON.parse(previous);
    } catch {
      return;
    }
  }
  if (!record(previous)) return; // No recoverable object to compare after malformed JSON.
  const issues: SpecIssue[] = [];
  const specificallyReported = (path: (string | number)[]) =>
    repair.issues.some((issue) =>
      path.length === issue.path.length && startsWith(path, issue.path)
    );
  const allowed = (path: (string | number)[]) =>
    repair.issues.some((issue) => startsWith(path, issue.path));
  const affected = (path: (string | number)[]) =>
    repair.issues.some((issue) =>
      startsWith(path, issue.path) || startsWith(issue.path, path)
    );
  const fail = (
    path: (string | number)[],
    code: SpecIssue["code"],
    message: string,
  ) => issues.push({ code, path, message });
  const renames = new Map<
    number,
    { figure?: [string, string]; elements: Map<string, string> }
  >();
  const collectRenames = (
    before: unknown,
    after: unknown,
    path: (string | number)[],
  ) => {
    if (Array.isArray(before) && Array.isArray(after)) {
      before.forEach((item, i) => collectRenames(item, after[i], [...path, i]));
      return;
    }
    const a = record(before), b = record(after);
    if (!a || !b) return;
    if (
      typeof a.id === "string" && typeof b.id === "string" && a.id !== b.id &&
      specificallyReported([...path, "id"]) && path[0] === "figures" &&
      typeof path[1] === "number"
    ) {
      const names = renames.get(path[1]) ??
        { elements: new Map<string, string>() };
      if (path.length === 2) names.figure = [a.id, b.id];
      else names.elements.set(a.id, b.id);
      renames.set(path[1], names);
    }
    for (const key of Object.keys(a)) {
      collectRenames(a[key], b[key], [...path, key]);
    }
  };
  collectRenames(previous, corrected, []);
  const followsRename = (
    before: unknown,
    after: unknown,
    path: (string | number)[],
  ) => {
    if (
      typeof before !== "string" || typeof after !== "string" ||
      typeof path[1] !== "number"
    ) return false;
    const names = renames.get(path[1]);
    if (!names) return false;
    if (path.includes("targetIds")) {
      let expected = before;
      if (names.figure && expected.startsWith(`${names.figure[0]}.`)) {
        expected = names.figure[1] + expected.slice(names.figure[0].length);
      }
      const parts = expected.split(".");
      if (parts.length === 3 && names.elements.has(parts[1])) {
        parts[1] = names.elements.get(parts[1])!;
      }
      return parts.join(".") === after;
    }
    const referenceKey = typeof path.at(-1) === "number"
      ? path.at(-2)
      : path.at(-1);
    return [
      "point",
      "circle",
      "center",
      "target",
      "through",
      "points",
      "objects",
      "onto",
    ].includes(String(referenceKey)) && names.elements.get(before) === after;
  };
  const visit = (
    before: unknown,
    after: unknown,
    path: (string | number)[],
  ) => {
    if (
      JSON.stringify(before) === JSON.stringify(after) ||
      followsRename(before, after, path)
    ) return;
    if (Array.isArray(before)) {
      const containsContent = before.some((item) => record(item) !== undefined);
      if (!Array.isArray(after) || after.length < before.length) {
        if (containsContent || !allowed(path)) {
          fail(
            path,
            "CONTENT_REMOVED",
            "Correction must preserve every figure, element, and annotation.",
          );
          return;
        }
        // Invalid primitive arrays (target counts, coordinate arity, references)
        // may shrink when the array itself is the reported defect.
        return;
      }
      const ids = before.map((item) => record(item)?.id);
      const matchById = ids.every((id) =>
        typeof id === "string" && /^[a-z][a-z0-9-]*$/.test(id)
      ) && new Set(ids).size === ids.length;
      before.forEach((item, i) => {
        const id = record(item)?.id;
        const canChangeId = specificallyReported([...path, i, "id"]);
        const replacementIndex = matchById && !canChangeId
          ? after.findIndex((next) =>
            record(next)?.id === id
          )
          : i;
        if (replacementIndex === -1) {
          fail(
            [...path, i],
            "CONTENT_REMOVED",
            `Correction removed element '${id}'.`,
          );
          return;
        }
        if (replacementIndex !== i && !affected(path)) {
          fail(
            [...path, i],
            "UNRELATED_CHANGE",
            "Correction reordered unaffected content.",
          );
        }
        visit(item, after[replacementIndex], [...path, i]);
      });
      if (after.length > before.length && !allowed(path)) {
        fail(path, "UNRELATED_CHANGE", "Correction added unrelated content.");
      }
      return;
    }
    const a = record(before), b = record(after);
    if (a && b) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        visit(a[key], b[key], [...path, key]);
      }
      return;
    }
    // Stable identities and annotation types are never collateral changes, even
    // when a coarse geometry diagnostic covers the containing figure.
    if (
      path.at(-1) === "id" && typeof before === "string" &&
      /^[a-z][a-z0-9-]*$/.test(before) && !specificallyReported(path)
    ) {
      fail(
        path,
        "UNRELATED_CHANGE",
        "Correction changed a stable ID without an ID issue.",
      );
      return;
    }
    if (
      path.includes("annotations") && path.at(-1) === "type" &&
      !specificallyReported(path)
    ) {
      fail(
        path,
        "UNRELATED_CHANGE",
        "Correction must preserve annotation types.",
      );
      return;
    }
    if (before !== undefined && after === undefined && !allowed(path)) {
      fail(path, "CONTENT_REMOVED", "Correction removed unaffected content.");
    } else if (!allowed(path)) {
      // Parsing may trim field whitespace; that does not change its meaning.
      if (
        typeof before === "string" && typeof after === "string" &&
        before.trim() === after.trim()
      ) return;
      fail(
        path,
        "UNRELATED_CHANGE",
        "Correction changed a field unrelated to the reported issues.",
      );
    }
  };
  visit(previous, corrected, []);
  if (issues.length) throw new WhiteboardSpecError(issues);
}
