import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  executeWhiteboard,
  executeWhiteboardWith,
  whiteboardSpecWith,
} from "./index.ts";
import { whiteboardFigures } from "./figures/index.ts";
import type { WhiteboardGoalClassification } from "./classifier.ts";
import { applyDrawingAnimation } from "../whiteboard-video/drawing/index.ts";
import { renderWhiteboardSvg } from "./render/index.ts";
import { whiteboardRoutes } from "./route.ts";
import { whiteboardHttpError } from "./render/http-error.ts";
import { WhiteboardSpecError } from "./spec/validation.ts";
import type { WhiteboardRequest, WhiteboardSpec } from "./schema.ts";

const spec: WhiteboardSpec = {
  title: null,
  figures: ["first", "second"].map((id, i) => ({
    type: "math_expressions",
    id,
    title: null,
    anchor: i === 0 ? null : "first",
    side: i === 0 ? null : "bottom",
    expressions: [{ id: "answer", latex: "x = 8" }],
    annotations: [{
      type: "box",
      targetIds: [`${id}.answer.expression`],
      content: null,
    }],
  })),
};
const unexpected = () => {
  throw new Error("Unexpected model or upload call");
};

Deno.test("goal → classification → spec → real SVG, with no upload", async () => {
  for (const orientation of ["portrait", "landscape"] as const) {
    let classifications = 0, generations = 0;
    const result = await executeWhiteboardWith({
      goal: "Show x = 8 twice",
      mode: "fast",
      orientation,
      format: "svg",
    }, {
      generateSpec: (input) =>
        whiteboardSpecWith(input, {
          classify: () => {
            classifications++;
            return Promise.resolve(Object.fromEntries([
              ["needs_board_title", 0],
              ...whiteboardFigures.map((
                f,
              ) => [`needs_${f.type}`, f.type === "math_expressions" ? 1 : 0]),
            ]) as WhiteboardGoalClassification);
          },
          generate: (request) => {
            generations++;
            assertEquals(request.input.mode, "fast");
            return Promise.resolve({
              output: {
                title: null,
                figures: spec.figures.map((
                  { anchor: _anchor, side: _side, ...figure },
                ) => figure),
              },
            });
          },
        }),
      upload: unexpected,
    });
    assertEquals([classifications, generations], [1, 1]);
    assertEquals(result, {
      svg: renderWhiteboardSvg(spec, { orientation }).svg,
    });
    assert(result.svg?.includes('data-annotation-type="box"'));
    assertEquals(result.url, undefined);
  }
});

Deno.test("URL output uploads the completed SVG once; defaults to URL and portrait", async () => {
  for (const format of [undefined, "url"] as const) {
    let uploads = 0;
    const result = await executeWhiteboardWith({ goal: "Show x = 8", format }, {
      generateSpec: () => Promise.resolve(spec),
      upload: (svg) => {
        uploads++;
        assertEquals(
          svg,
          renderWhiteboardSvg(spec, { orientation: "portrait" }).svg,
        );
        return Promise.resolve("https://test.invalid/real-upload.svg");
      },
    });
    assertEquals(uploads, 1);
    assertEquals(result, { url: "https://test.invalid/real-upload.svg" });
  }
});

Deno.test("public execution renders a saved spec without model or storage credentials", async () => {
  const result = await executeWhiteboard({
    ...spec,
    format: "svg",
    orientation: "landscape",
  });
  assertEquals(result, {
    svg: renderWhiteboardSvg(spec, { orientation: "landscape" }).svg,
  });
  const anchored = structuredClone(spec);
  anchored.figures[1].side = "right";
  const direct = await executeWhiteboardWith(anchored, {
    generateSpec: unexpected,
    upload: (svg) => {
      assertEquals(svg, renderWhiteboardSvg(anchored).svg);
      return Promise.resolve("https://test.invalid/saved.svg");
    },
  });
  assertEquals(direct.url, "https://test.invalid/saved.svg");
});

Deno.test("invalid input and failed generation/rendering never upload", async () => {
  await assertRejects(
    () =>
      executeWhiteboardWith({ goal: " " }, {
        generateSpec: unexpected,
        upload: unexpected,
      }),
    WhiteboardSpecError,
  );
  const invalid = structuredClone(spec);
  invalid.figures[0].annotations![0].targetIds = ["first.missing.expression"];
  await assertRejects(() =>
    executeWhiteboardWith({ goal: "Show" }, {
      generateSpec: () => Promise.resolve(invalid),
      upload: unexpected,
    })
  );
  await assertRejects(() =>
    executeWhiteboardWith(
      { ...spec, orientation: "diagonal" } as unknown as WhiteboardRequest,
      {
        generateSpec: unexpected,
        upload: unexpected,
      },
    )
  );
  const failure = new Error("Model unavailable");
  const caught = await assertRejects(() =>
    executeWhiteboardWith({ goal: "Show" }, {
      generateSpec: () => {
        throw failure;
      },
      upload: unexpected,
    })
  );
  assert(caught === failure);
});

Deno.test("upload failures propagate without fabricated success or retries", async () => {
  let uploads = 0;
  const failure = new Error("Storage unavailable");
  const caught = await assertRejects(() =>
    executeWhiteboardWith(spec, {
      generateSpec: unexpected,
      upload: () => {
        uploads++;
        throw failure;
      },
    })
  );
  assert(caught === failure);
  assertEquals(uploads, 1);
});

Deno.test("HTTP endpoint returns actual SVG for saved specs and rejects invalid options", async () => {
  const response = await whiteboardRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...spec, format: "svg", orientation: "landscape" }),
  });
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(
    body.data.svg,
    renderWhiteboardSvg(spec, { orientation: "landscape" }).svg,
  );
  assertEquals(body.data.goal, null);
  assertEquals(body.data.url, undefined);
  assert(typeof body.data.durationMs === "number");
  const invalid = await whiteboardRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...spec, format: "png" }),
  });
  assertEquals(invalid.status, 400);
});

Deno.test("spec failures keep actionable HTTP diagnostics", () => {
  const issues = [{
    code: "UNKNOWN_TARGET" as const,
    path: ["figures", 0, "annotations", 0],
    message: "Unknown target",
    figureId: "first",
    annotationIndex: 0,
  }];
  const result = whiteboardHttpError(new WhiteboardSpecError(issues), true);
  assertEquals(result.status, 500);
  assertEquals(result.body.error.code, "WHITEBOARD_SPEC_FAILED");
  assertEquals(result.body.error.issues, issues);
});

Deno.test("font delivery switches for generated and saved specs, defaulting to embedded", async () => {
  const hostedUrl =
    "https://static.noahbjorner.com/sixtus/fonts/shantell-sans-math-medium.woff2";
  for (const fontMode of [undefined, "embedded", "hosted"] as const) {
    const rendered = renderWhiteboardSvg(spec, { fontMode });
    for (const stage of Object.values(rendered.stages)) {
      assertEquals(stage.svg.includes(hostedUrl), fontMode === "hosted");
      assertEquals(stage.svg.includes("<metadata>"), fontMode !== "hosted");
      assertEquals(
        stage.svg.includes("SIL OPEN FONT LICENSE"),
        fontMode !== "hosted",
      );
      assertEquals(
        stage.svg.includes("data:font/woff2;base64,"),
        fontMode !== "hosted",
      );
      assertEquals(stage.svg.split("@font-face").length - 1, 1);
    }
    assertEquals(rendered.bounds, renderWhiteboardSvg(spec).bounds);
    for (const input of [{ goal: "Show x = 8" }, spec]) {
      const result = await executeWhiteboardWith({
        ...input,
        format: "svg",
        fontMode,
      }, {
        generateSpec: () => Promise.resolve(spec),
        upload: unexpected,
      });
      assertEquals(result.svg, rendered.svg);
    }
  }
  const response = await whiteboardRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...spec, format: "svg", fontMode: "hosted" }),
  });
  assertEquals(response.status, 200);
  assert((await response.json()).data.svg.includes(hostedUrl));
  const invalid = await whiteboardRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...spec, fontMode: "invalid" }),
  });
  assertEquals(invalid.status, 400);
});

Deno.test("drawing animation is applied as the last step when requested", async () => {
  const staticSvg = renderWhiteboardSvg(spec, { orientation: "portrait" }).svg;
  assert(!staticSvg.includes("data-drawing-animation"));
  const animatedSvg = applyDrawingAnimation(staticSvg, { speed: 1.5 });
  assert(animatedSvg.includes('data-drawing-animation="strokes-v1"'));
  for (const animation of [undefined, "static", "animated"] as const) {
    for (const input of [{ goal: "Show x = 8" }, spec]) {
      const result = await executeWhiteboardWith({
        ...input,
        format: "svg",
        orientation: "portrait",
        animation,
      }, {
        generateSpec: () => Promise.resolve(spec),
        upload: unexpected,
      });
      assertEquals(
        result.svg,
        animation === "animated" ? animatedSvg : staticSvg,
      );
    }
  }
  const response = await whiteboardRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...spec, format: "svg", animation: "animated" }),
  });
  assertEquals(response.status, 200);
  assert(
    (await response.json()).data.svg.includes(
      'data-drawing-animation="strokes-v1"',
    ),
  );
  const invalid = await whiteboardRoutes.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...spec, animation: "wipe" }),
  });
  assertEquals(invalid.status, 400);
});
