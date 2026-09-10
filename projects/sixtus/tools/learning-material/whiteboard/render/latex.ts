/** A deliberately bounded math-only LaTeX grammar, not a TeX interpreter.
 * Reject unsupported input instead of displaying raw commands or changing meaning.
 * This module does no font loading, rendering, or evaluation of expressions.
 */
export type MathNode =
  | { kind: "text"; value: string }
  | { kind: "space"; em: number }
  | { kind: "row"; children: MathNode[] }
  | { kind: "fraction"; numerator: MathNode; denominator: MathNode }
  | { kind: "root"; body: MathNode; index?: MathNode }
  | { kind: "scripts"; base: MathNode; sup?: MathNode; sub?: MathNode }
  | { kind: "delimited"; body: MathNode; left: string; right: string }
  | { kind: "operator"; value: string }
  | { kind: "align"; rows: MathNode[][] };

const operators: Record<string, string> = {
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
};
const spaces: Record<string, number> = {
  ",": 1 / 6,
  ":": 2 / 9,
  ";": 5 / 18,
  " ": 1 / 3,
  quad: 1,
  qquad: 2,
};

export function parseMathLatex(source: string): MathNode {
  if (!source.trim() || source.length > 2000) {
    throw new Error("Math LaTeX must contain 1–2000 characters.");
  }
  let pos = 0;
  let depth = 0;
  const fail = (message: string): never => {
    throw new Error(`Invalid math LaTeX at character ${pos + 1}: ${message}`);
  };
  const skip = () => {
    while (/\s/.test(source[pos] ?? "") && pos < source.length) pos++;
  };
  const command = () => {
    pos++; // backslash
    const word = source.slice(pos).match(/^[a-zA-Z]+/)?.[0];
    const value = word ?? source[pos];
    if (!value) return fail("Incomplete command.");
    pos += value.length;
    return value;
  };
  const nested = (read: () => MathNode): MathNode => {
    if (++depth > 32) fail("Nesting exceeds 32 levels.");
    const result = read();
    depth--;
    return result;
  };
  const environment = (): string => {
    skip();
    if (source[pos++] !== "{") {
      return fail("Expected a braced environment name.");
    }
    const name = source.slice(pos).match(/^[a-zA-Z]+\*?/)?.[0];
    if (!name) return fail("Expected an environment name.");
    pos += name.length;
    if (source[pos++] !== "}") {
      return fail("Expected '}' after the environment name.");
    }
    return name;
  };
  const group = (): MathNode => {
    skip();
    if (source[pos] !== "{") return fail("Expected a braced argument.");
    pos++;
    return nested(() => row("}"));
  };
  let cellStop: "&" | "\\\\" | "end" | undefined;
  const argument = (): MathNode => {
    skip();
    return source[pos] === "{" ? group() : nested(atom);
  };
  const atom = (): MathNode => {
    skip();
    const char = source[pos];
    if (!char) return fail("Missing argument.");
    if (char === "{") return group();
    if (char === "\\") {
      const name = command();
      if (Object.hasOwn(operators, name)) {
        return { kind: "operator", value: operators[name] };
      }
      if (Object.hasOwn(spaces, name)) {
        return { kind: "space", em: spaces[name] };
      }
      if (["sin", "cos", "tan", "log", "ln"].includes(name)) {
        return { kind: "text", value: name };
      }
      if (name === "frac") {
        return { kind: "fraction", numerator: group(), denominator: group() };
      }
      if (name === "sqrt") {
        skip();
        let index: MathNode | undefined;
        if (source[pos] === "[") {
          pos++;
          index = nested(() => row("]"));
        }
        return { kind: "root", body: group(), index };
      }
      if (name === "text") {
        skip();
        if (source[pos++] !== "{") return fail("Expected a text argument.");
        let value = "";
        while (pos < source.length && source[pos] !== "}") {
          if (source[pos] === "{" || source[pos] === "\\") {
            return fail(
              "Nested groups and commands are not supported inside text.",
            );
          }
          value += source[pos++];
        }
        if (source[pos++] !== "}" || !value.trim()) {
          return fail("Expected nonempty, closed text.");
        }
        return { kind: "text", value };
      }
      if (name === "left") {
        skip();
        const left = source[pos++];
        const right =
          ({ "(": ")", "[": "]", "|": "|" } as Record<string, string>)[left];
        if (!right) return fail("Supported left delimiters are (, [, and |.");
        const body = nested(() => row("\\right"));
        skip();
        if (source[pos++] !== right) return fail("Mismatched right delimiter.");
        return { kind: "delimited", body, left, right };
      }
      if (name === "begin") {
        const env = environment();
        if (env !== "align" && env !== "align*") {
          return fail(`Unsupported environment '${env}'.`);
        }
        return nested(() => {
          const rows: MathNode[][] = [];
          let cells: MathNode[] = [];
          const emptyCell = (node: MathNode) =>
            node.kind === "row" &&
            node.children.every((child) => child.kind === "space");
          while (true) {
            cells.push(row(undefined, true));
            if (cellStop === "&") continue;
            if (cellStop === "\\\\") {
              rows.push(cells);
              cells = [];
              continue;
            }
            if (cellStop === "end") {
              pos += 4;
              const endEnv = environment();
              if (endEnv !== env) {
                return fail(`Expected \\end{${env}}.`);
              }
              if (
                !(cells.length === 1 && emptyCell(cells[0])) ||
                rows.length === 0
              ) {
                rows.push(cells);
              }
              break;
            }
            return fail(`Missing \\end{${env}}.`);
          }
          if (!rows.length) return fail("Empty align environment.");
          return { kind: "align", rows };
        });
      }
      return fail(`Unsupported command \\${name}.`);
    }
    pos++;
    if ("+-=<>×·÷±≤≥≠".includes(char)) return { kind: "operator", value: char };
    if (/[a-zA-Z0-9()[\].,;:|/!]/.test(char)) {
      return { kind: "text", value: char };
    }
    return fail(`Unsupported character '${char}'.`);
  };
  const row = (stop?: string, cellMode = false): MathNode => {
    const children: MathNode[] = [];
    if (cellMode) cellStop = undefined;
    while (true) {
      skip();
      if (stop && source.startsWith(stop, pos)) {
        // A command boundary matters: \\rightarrow is not \\right.
        if (
          stop !== "\\right" ||
          !/[a-zA-Z]/.test(source[pos + stop.length] ?? "")
        ) {
          pos += stop.length;
          break;
        }
      }
      if (cellMode) {
        if (source[pos] === "&") {
          pos++;
          cellStop = "&";
          break;
        }
        if (source.startsWith("\\\\", pos)) {
          pos += 2;
          cellStop = "\\\\";
          break;
        }
        if (
          source.startsWith("\\end", pos) &&
          !/[a-zA-Z]/.test(source[pos + 4] ?? "")
        ) {
          cellStop = "end";
          break;
        }
      }
      if (pos >= source.length) {
        if (stop) fail(`Missing '${stop}'.`);
        if (cellMode) fail("Missing \\end for align environment.");
        break;
      }
      let base = atom();
      let sup: MathNode | undefined, sub: MathNode | undefined;
      skip();
      while (source[pos] === "^" || source[pos] === "_") {
        const script = source[pos++];
        if (script === "^") {
          if (sup) fail("Duplicate superscript.");
          sup = argument();
        } else {
          if (sub) fail("Duplicate subscript.");
          sub = argument();
        }
        skip();
      }
      if (sup || sub) base = { kind: "scripts", base, sup, sub };
      children.push(base);
    }
    if (!children.length || children.every((child) => child.kind === "space")) {
      if (cellMode) return { kind: "row", children };
      return fail("Empty expression or group.");
    }
    return { kind: "row", children };
  };
  return row();
}
