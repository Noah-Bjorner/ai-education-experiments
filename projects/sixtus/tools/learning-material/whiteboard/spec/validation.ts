import { z } from "@zod";
import {
  type WhiteboardInput,
  whiteboardInputSchema,
  WhiteboardOutput,
  type WhiteboardSpec,
} from "../schema.ts";
import {
  type AnnotationTargetPart,
  collectElementIds,
} from "../figures/shared.ts";
import {
  type FigureDefinition,
  type GeneratedBoard,
  type GeneratedFigure,
  generatedFigureSchema,
  generatedTitleSchema,
} from "./schema.ts";

export type SpecIssue = {
  code:
    | "INVALID_INPUT"
    | "INVALID_CLASSIFICATION"
    | "NO_FIGURE_MATCH"
    | "INVALID_SPEC"
    | "UNKNOWN_TARGET"
    | "INVALID_ANNOTATION"
    | "CONTENT_REMOVED"
    | "UNRELATED_CHANGE";
  path: (string | number)[];
  message: string;
  figureId?: string;
  elementId?: string;
  annotationIndex?: number;
  availableTargetIds?: string[];
};

export class WhiteboardSpecError extends Error {
  constructor(readonly issues: SpecIssue[], options?: ErrorOptions) {
    super(
      issues.map((issue) =>
        `${issue.path.join(".") || "spec"}: ${issue.message}`
      ).join("\n"),
      options,
    );
    this.name = "WhiteboardSpecError";
  }
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function atPath(value: unknown, path: readonly PropertyKey[]): unknown {
  for (const key of path) {
    value = (value as Record<PropertyKey, unknown> | null)?.[key];
  }
  return value;
}

/** Select the matching nested union branch so a bad point doesn't yield every shape's errors. */
export function schemaIssues(
  error: z.ZodError,
  source: unknown,
  prefix: (string | number)[] = [],
  code: SpecIssue["code"] = "INVALID_SPEC",
): SpecIssue[] {
  const flatten = (issues: readonly z.core.$ZodIssue[]): SpecIssue[] =>
    issues.flatMap((issue) => {
      if (issue.code === "unrecognized_keys") {
        return issue.keys.flatMap((key) =>
          flatten([{
            code: "custom",
            path: [...issue.path, key],
            message: `Unexpected field '${key}'.`,
          }])
        );
      }
      if (issue.code === "invalid_union") {
        const matching = issue.errors.filter((branch) =>
          !branch.some((child) =>
            child.code === "invalid_value" &&
            ["type", "kind"].includes(String(child.path.at(-1)))
          )
        );
        if (matching.length === 1) return flatten(matching[0]);
      }
      const path = [
        ...prefix,
        ...issue.path.map((key) => typeof key === "number" ? key : String(key)),
      ];
      const figure = record(atPath(source, path.slice(0, 2)));
      let elementId: string | undefined;
      for (let length = path.length; length > 2; length--) {
        const parent = record(atPath(source, path.slice(0, length)));
        if (typeof parent?.id === "string") {
          elementId = parent.id;
          break;
        }
      }
      const annotationPosition = path.indexOf("annotations");
      return [{
        code,
        path,
        message: issue.message,
        figureId: typeof figure?.id === "string" ? figure.id : undefined,
        elementId,
        annotationIndex: annotationPosition >= 0 &&
            typeof path[annotationPosition + 1] === "number"
          ? path[annotationPosition + 1] as number
          : undefined,
      }];
    });
  return flatten(error.issues);
}

/** Pure semantic catalog. A listed target may still be clipped or unrenderable later. */
export function semanticTargets(
  figure: GeneratedFigure,
  definition: FigureDefinition,
) {
  // The registry lookup establishes the correlated figure/definition pair.
  if (figure.type !== definition.type) {
    throw new Error("Mismatched figure target definition.");
  }
  const parts = (definition.annotationTargetParts as (
    figure: GeneratedFigure,
  ) => AnnotationTargetPart[])(figure);
  return new Map(parts.map(({ part, kind }) => [`${figure.id}.${part}`, kind]));
}

function figureIssues(
  figure: GeneratedFigure,
  definition: FigureDefinition,
  i: number,
): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const add = (
    path: (string | number)[],
    message: string,
    extra: Partial<SpecIssue> = {},
  ) => {
    issues.push({
      code: "INVALID_SPEC",
      path: ["figures", i, ...path],
      message,
      figureId: figure.id,
      ...extra,
    });
  };
  const seen = new Set<string>();
  for (const { id, path } of collectElementIds(figure)) {
    if (seen.has(id)) {
      add([...path, "id"], `Duplicate element ID '${id}'.`, {
        elementId: id,
      });
    }
    seen.add(id);
  }
  const targets = semanticTargets(figure, definition);
  figure.annotations.forEach((annotation, a) => {
    const needsText = annotation.type === "underline" ||
      annotation.type === "strikethrough";
    const availableTargetIds = [...targets].filter(([, kind]) =>
      !needsText || kind === "text"
    ).map(([id]) => id);
    annotation.targetIds.forEach((id, t) => {
      const kind = targets.get(id);
      if (!kind || (needsText && kind !== "text")) {
        add(
          ["annotations", a, "targetIds", t],
          !kind
            ? `Unknown or unavailable target '${id}' in this figure.`
            : `'${annotation.type}' requires a text target.`,
          {
            code: !kind ? "UNKNOWN_TARGET" : "INVALID_ANNOTATION",
            annotationIndex: a,
            availableTargetIds,
          },
        );
      }
    });
  });
  return issues;
}

/** Parse by selected figure type for precise diagnostics, then assign application-owned placement. */
export function validateGeneratedBoard(
  source: unknown,
  availableFigures: readonly FigureDefinition[],
  showTitle: boolean,
): { content: GeneratedBoard; spec: WhiteboardSpec } {
  const envelope = z.strictObject({
    title: z.unknown(),
    figures: z.array(z.unknown()).min(1),
  }).safeParse(source);
  if (!envelope.success) {
    throw new WhiteboardSpecError(schemaIssues(envelope.error, source));
  }
  const figures: GeneratedFigure[] = [];
  const title = generatedTitleSchema(showTitle).safeParse(envelope.data.title);
  const issues: SpecIssue[] = title.success
    ? []
    : schemaIssues(title.error, source, ["title"]);
  envelope.data.figures.forEach((raw, i) => {
    const definition = availableFigures.find((d) =>
      d.type === record(raw)?.type
    );
    if (!definition) {
      issues.push({
        code: "INVALID_SPEC",
        path: ["figures", i, "type"],
        message: `Choose an available figure type: ${
          availableFigures.map((d) => d.type).join(", ")
        }.`,
      });
      return;
    }
    const parsed = generatedFigureSchema(definition).safeParse(raw);
    if (!parsed.success) {
      issues.push(...schemaIssues(parsed.error, source, ["figures", i]));
    } else {
      figures.push(parsed.data);
      issues.push(...figureIssues(parsed.data, definition, i));
    }
  });
  // Only structurally parsed figures can be checked for board ordering. Keep original indices.
  if (figures.length !== envelope.data.figures.length) {
    throw new WhiteboardSpecError(issues);
  }
  const content: GeneratedBoard = {
    title: title.success ? title.data : null,
    figures,
  };
  const placed = {
    ...content,
    figures: figures.map((figure, i) => ({
      ...figure,
      anchor: i === 0 ? null : figures[i - 1].id,
      side: i === 0 ? null : "bottom" as const,
    })),
  };
  const parsed = WhiteboardOutput.safeParse(placed);
  if (!parsed.success) issues.push(...schemaIssues(parsed.error, placed));
  if (issues.length) throw new WhiteboardSpecError(issues);
  if (!parsed.success) throw new Error("Unreachable board validation state.");
  return { content, spec: parsed.data };
}

/** Validate before any classification request, and when the spec stage is called directly. */
export function validateWhiteboardInput(
  input: WhiteboardInput,
): WhiteboardInput {
  const parsed = whiteboardInputSchema.safeExtend({
    goal: z.string().trim().min(1),
  }).safeParse(input);
  if (!parsed.success) {
    throw new WhiteboardSpecError(
      schemaIssues(parsed.error, input, [], "INVALID_INPUT"),
    );
  }
  return parsed.data;
}
