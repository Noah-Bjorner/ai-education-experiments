/** Small math grammar shared by spec validation and a future plot renderer.
 * No JavaScript evaluation, implicit multiplication, assignments, or user code.
 */
export type CoordinateExpression =
  | { type: "number"; value: number }
  | { type: "symbol"; name: "x" | "pi" | "e" }
  | { type: "unary"; operator: "+" | "-"; operand: CoordinateExpression }
  | {
    type: "binary";
    operator: "+" | "-" | "*" | "/" | "^";
    left: CoordinateExpression;
    right: CoordinateExpression;
  }
  | { type: "call"; name: string; argument: CoordinateExpression };

export const coordinateFunctions = [
  "sqrt",
  "abs",
  "sin",
  "cos",
  "tan",
  "exp",
  "ln",
  "log10",
] as const;

export function parseCoordinateExpression(
  source: string,
): CoordinateExpression {
  if (!source.trim() || source.length > 1000) {
    throw new Error("Expression must contain 1–1000 characters.");
  }
  const tokens: string[] = [];
  const lexer =
    /\s*(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[a-zA-Z][a-zA-Z0-9]*|[()+*/^\-])/y;
  let position = 0;
  while (position < source.trimEnd().length) {
    lexer.lastIndex = position;
    const match = lexer.exec(source);
    if (!match) {
      throw new Error(`Invalid expression token at position ${position}.`);
    }
    tokens.push(match[1]);
    position = lexer.lastIndex;
  }
  // Bound recursive parsing depth and future evaluation work.
  if (tokens.length > 256) throw new Error("Expression exceeds 256 tokens.");
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const expect = (token: string) => {
    if (take() !== token) throw new Error(`Expected '${token}'.`);
  };

  function atom(): CoordinateExpression {
    const token = take();
    if (token === undefined) {
      throw new Error("Expected a number, x, or function.");
    }
    if (token === "(") {
      const result = sum();
      expect(")");
      return result;
    }
    if (/^[\d.]/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error("Numbers must be finite.");
      return { type: "number", value };
    }
    if (token === "x" || token === "pi" || token === "e") {
      return { type: "symbol", name: token };
    }
    if (coordinateFunctions.some((name) => name === token)) {
      expect("(");
      const argument = sum();
      expect(")");
      return { type: "call", name: token, argument };
    }
    throw new Error(`Unsupported symbol '${token}'.`);
  }

  function power(): CoordinateExpression {
    const left = atom();
    if (peek() !== "^") return left;
    take();
    return { type: "binary", operator: "^", left, right: unary() };
  }

  function unary(): CoordinateExpression {
    const operator = peek();
    if (operator !== "+" && operator !== "-") return power();
    take();
    return { type: "unary", operator, operand: unary() };
  }

  function product(): CoordinateExpression {
    let left = unary();
    while (peek() === "*" || peek() === "/") {
      const operator = take() as "*" | "/";
      left = { type: "binary", operator, left, right: unary() };
    }
    return left;
  }

  function sum(): CoordinateExpression {
    let left = product();
    while (peek() === "+" || peek() === "-") {
      const operator = take() as "+" | "-";
      left = { type: "binary", operator, left, right: product() };
    }
    return left;
  }

  const result = sum();
  if (cursor !== tokens.length) {
    throw new Error(
      `Unexpected '${peek()}'; use explicit multiplication, e.g. 2*x.`,
    );
  }
  return result;
}
