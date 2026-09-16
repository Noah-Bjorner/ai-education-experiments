import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  executeWhiteboardWith,
  type FigureGenerator,
  generatePreparedBoard,
  InvalidGeneratedOutput,
} from "./generation.ts";
import type { WhiteboardPlan } from "./index-old-1.ts";
import type { WhiteboardFigureContent } from "./schema.ts";
import { composeWhiteboard, renderWhiteboardSvg } from "./render/index.ts";
import { renderError, WhiteboardRenderError } from "./render/issues.ts";
import { whiteboardHttpError } from "./render/http-error.ts";

const plan: WhiteboardPlan = {
  title: null,
  figurePlans: [1, 2].map((n) => ({
    type: "math_expressions",
    id: `figure-${n}`,
    anchor: n === 1 ? null : "figure-1",
    side: n === 1 ? null : "bottom",
    instructions: "Show x = 8.",
  })),
};
const good = (id: string): WhiteboardFigureContent => ({
  type: "math_expressions",
  id,
  title: null,
  annotations: [{
    type: "box",
    targetIds: [`${id}.final.expression`],
    content: null,
  }],
  expressions: [{ id: "final", latex: "x=8" }],
});
const noTitle = () => {
  throw new Error("Unexpected title correction");
};

Deno.test("only the failed figure is repaired, with exact issues and original output", async () => {
  const calls = new Map<string, number>();
  const generateFigure: FigureGenerator = (p, _context, repair) => {
    const count = (calls.get(p.id) ?? 0) + 1;
    calls.set(p.id, count);
    if (p.id === "figure-2" && count === 1) {
      return Promise.resolve({
        ...good(p.id),
        expressions: [{ id: "final", latex: "∵ x=8" }],
      });
    }
    if (count === 2) {
      assert(repair);
      assertEquals(repair.issues[0].code, "UNSUPPORTED_GLYPH");
      assertEquals(repair.issues[0].figureId, p.id);
      assertEquals(repair.issues[0].elementId, "final");
      assert(JSON.stringify(repair.previous).includes("∵"));
    }
    return Promise.resolve(good(p.id));
  };
  const result = await generatePreparedBoard(plan, {}, {
    generateFigure,
    correctTitle: noTitle,
  });
  assertEquals([...calls], [["figure-1", 1], ["figure-2", 2]]);
  assertEquals(result.prepared.map((figure) => figure.id), [
    "figure-1",
    "figure-2",
  ]);
  assertEquals(result.rendered, renderWhiteboardSvg(result.spec));
  const base = result.prepared[0].base;
  assertEquals(
    composeWhiteboard(result.spec, result.prepared),
    result.rendered,
  );
  assert(result.prepared[0].base === base);
});

Deno.test("unknown annotation target diagnostics include compatible visible targets", async () => {
  const single = { ...plan, figurePlans: plan.figurePlans.slice(0, 1) };
  let calls = 0;
  await generatePreparedBoard(single, {}, {
    generateFigure: (p, _context, repair) => {
      if (++calls === 1) {
        return Promise.resolve({
          ...good(p.id),
          annotations: [{
            type: "box",
            targetIds: [`${p.id}.final.result`],
            content: null,
          }],
        });
      }
      assertEquals(repair?.issues[0].code, "UNKNOWN_TARGET");
      assert(
        repair?.issues[0].availableTargetIds?.includes(
          `${p.id}.final.expression`,
        ),
      );
      return Promise.resolve(good(p.id));
    },
    correctTitle: noTitle,
  });
  assertEquals(calls, 2);
});

Deno.test("schema failures repair once and corrected output is revalidated", async () => {
  let calls = 0;
  const error = await assertRejects(
    () =>
      generatePreparedBoard(
        { ...plan, figurePlans: plan.figurePlans.slice(0, 1) },
        {},
        {
          generateFigure: (p, _context, repair) => {
            calls++;
            if (calls === 1) {
              throw new InvalidGeneratedOutput(
                "broken JSON",
                renderError("INVALID_SPEC", "Invalid JSON").issues,
              );
            }
            assertEquals(repair?.previous, "broken JSON");
            return Promise.resolve({ ...good(p.id), expressions: [] });
          },
          correctTitle: noTitle,
        },
      ),
    WhiteboardRenderError,
  );
  assertEquals(calls, 2);
  assert(error.issues.some((issue) => issue.code === "INVALID_SPEC"));
});

Deno.test("exhausted repairs are aggregated and prevent upload", async () => {
  let calls = 0, uploads = 0;
  const error = await assertRejects(
    () =>
      executeWhiteboardWith({ goal: "Show an equation" }, {
        generatePlan: () => Promise.resolve(plan),
        generateFigure: (p) => {
          calls++;
          return Promise.resolve({
            ...good(p.id),
            expressions: [{ id: "final", latex: "∵" }],
          });
        },
        correctTitle: noTitle,
        upload: () => {
          uploads++;
          return Promise.resolve("unused");
        },
      }),
    WhiteboardRenderError,
  );
  assertEquals(calls, 4);
  assertEquals(uploads, 0);
  assertEquals(error.issues.map((issue) => issue.figureId), [
    "figure-1",
    "figure-2",
  ]);
});

Deno.test("unexpected generation errors are not model-retried or exposed", async () => {
  let calls = 0;
  const error = await assertRejects(
    () =>
      generatePreparedBoard(
        { ...plan, figurePlans: plan.figurePlans.slice(0, 1) },
        {},
        {
          generateFigure: () => {
            calls++;
            throw new Error("private provider payload");
          },
          correctTitle: noTitle,
        },
      ),
    WhiteboardRenderError,
  );
  assertEquals(calls, 1);
  assertEquals(error.repairable, false);
  assert(error.cause);
  const response = whiteboardHttpError(error, true);
  assertEquals(response.status, 500);
  assert(!JSON.stringify(response).includes("private provider payload"));
});

Deno.test("board title correction reuses every prepared figure", async () => {
  let figures = 0, titles = 0;
  const result = await generatePreparedBoard({ ...plan, title: "😀" }, {}, {
    generateFigure: (p) => {
      figures++;
      return Promise.resolve(good(p.id));
    },
    correctTitle: (title, _context, issues) => {
      titles++;
      assertEquals(title, "😀");
      assertEquals(issues[0].stage, "title");
      return Promise.resolve("The solution");
    },
  });
  assertEquals(figures, 2);
  assertEquals(titles, 1);
  assertEquals(result.spec.title, "The solution");
  assertEquals(result.rendered, renderWhiteboardSvg(result.spec));
});

Deno.test("unrenderable title correction is rejected after one attempt", async () => {
  let titles = 0;
  await assertRejects(
    () =>
      generatePreparedBoard({ ...plan, title: "😀" }, {}, {
        generateFigure: (p) => Promise.resolve(good(p.id)),
        correctTitle: () => {
          titles++;
          return Promise.resolve("😀");
        },
      }),
    WhiteboardRenderError,
  );
  assertEquals(titles, 1);
});

Deno.test("supplied specs render deterministically without any model call", async () => {
  let uploads = 0;
  const unexpected = () => {
    throw new Error("Unexpected model call");
  };
  const spec = {
    title: null,
    figures: [{
      ...good("figure-1"),
      id: "figure-1",
      anchor: null,
      side: null,
    }],
  };
  const result = await executeWhiteboardWith(spec, {
    generatePlan: unexpected,
    generateFigure: unexpected,
    correctTitle: unexpected,
    upload: (svg) => {
      uploads++;
      assertEquals(svg, renderWhiteboardSvg(spec).svg);
      return Promise.resolve("https://example.test/board.svg");
    },
  });
  assertEquals(uploads, 1);
  assertEquals(result, { url: "https://example.test/board.svg" });
});

Deno.test("render failures return 422 only for supplied content", () => {
  const error = renderError("UNSUPPORTED_GLYPH", "Unsupported glyph", {
    figureId: "figure-1",
    elementId: "final",
  });
  assertEquals(whiteboardHttpError(error, false).status, 422);
  assertEquals(whiteboardHttpError(error, true).status, 500);
  assertEquals(whiteboardHttpError(new Error("secret"), false).status, 500);
});

Deno.test("repairs cannot silently discard original expressions or annotations", async () => {
  for (const omit of ["expression", "annotation"] as const) {
    let calls = 0;
    const error = await assertRejects(
      () =>
        generatePreparedBoard(
          { ...plan, figurePlans: plan.figurePlans.slice(0, 1) },
          {},
          {
            generateFigure: (p) => {
              calls++;
              if (calls === 1) {
                return Promise.resolve({
                  ...good(p.id),
                  expressions: [{ id: "final", latex: "∵ x=8" }],
                });
              }
              return Promise.resolve(
                omit === "annotation" ? { ...good(p.id), annotations: [] } : {
                  ...good(p.id),
                  expressions: [{ id: "different", latex: "x=8" }],
                },
              );
            },
            correctTitle: noTitle,
          },
        ),
      WhiteboardRenderError,
    );
    assertEquals(calls, 2);
    assert(
      error.issues.some((issue) =>
        issue.code === "INVALID_SPEC" || issue.code === "INVALID_ANNOTATION"
      ),
    );
  }
});

Deno.test("invalid supplied content never uploads or invokes a model", async () => {
  let uploads = 0;
  const unexpected = () => {
    throw new Error("Unexpected model call");
  };
  const error = await assertRejects(
    () =>
      executeWhiteboardWith({
        title: null,
        figures: [{
          ...good("figure-1"),
          type: "math_expressions",
          expressions: [{ id: "final", latex: "∵" }],
          id: "figure-1",
          anchor: null,
          side: null,
        }],
      }, {
        generatePlan: unexpected,
        generateFigure: unexpected,
        correctTitle: unexpected,
        upload: () => {
          uploads++;
          return Promise.resolve("unused");
        },
      }),
    WhiteboardRenderError,
  );
  assertEquals(uploads, 0);
  assertEquals(whiteboardHttpError(error, false).status, 422);
});
