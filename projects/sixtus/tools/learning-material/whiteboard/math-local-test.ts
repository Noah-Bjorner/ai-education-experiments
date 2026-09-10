import { z } from "@zod";
import { renderWhiteboardSvg } from "./render/index.ts";
import { mathExpressionsSchema } from "./children/math-expressions.ts";

const formSchema = z.object({
  latex: z.string().min(1).max(2000),
  title: z.string().trim().min(1).max(120).default("Math expression"),
  width: z.number().int().min(320).max(2400).default(800),
  height: z.number().int().min(240).max(1600).default(520),
});
const page = await Deno.readTextFile(
  new URL("./math-playground.html", import.meta.url),
);

export async function handleMathPlayground(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (request.method === "GET" && url.pathname === "/") {
    return new Response(page, {
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  }
  if (request.method === "POST" && url.pathname === "/render") {
    try {
      const raw = await request.text();
      if (raw.length > 16000) {
        return new Response("Input too large", { status: 413 });
      }
      const form = formSchema.parse(JSON.parse(raw));
      const child = mathExpressionsSchema.parse({
        type: "math_expressions",
        id: "math",
        title: form.title,
        expressions: [{ id: "expression", latex: form.latex }],
      });
      const spec = { layout: "single" as const, children: [child] };
      const result = renderWhiteboardSvg(spec, {
        width: form.width,
        height: form.height,
      });
      return Response.json({
        svg: result.svg,
        width: result.width,
        height: result.height,
        spec,
      }, { headers });
    } catch (error) {
      const message = error instanceof z.ZodError
        ? error.issues.map((issue) =>
          `${issue.path.join(".")}: ${issue.message}`
        ).join("\n")
        : error instanceof Error
        ? error.message
        : "Unable to render this expression.";
      return Response.json({ error: message }, { status: 400, headers });
    }
  }
  return new Response("Not found", { status: 404, headers });
}

if (import.meta.main) {
  Deno.serve({
    hostname: "127.0.0.1",
    port: 8787,
    onListen: () =>
      console.log(
        "Math playground: http://127.0.0.1:8787 — paste LaTeX; no AI calls or uploads.",
      ),
  }, handleMathPlayground);
}
