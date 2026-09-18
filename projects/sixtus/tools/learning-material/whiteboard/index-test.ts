import {
  type FigureType,
  parseClassification,
  selectFigures,
  type WhiteboardGoalClassification,
} from "./classifier.ts";
import { whiteboardSpecWith } from "./index.ts";
import { assertRepairPreservesContent } from "./spec/repair.ts";
import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { z } from "@zod";
import { whiteboardFigures } from "./figures/index.ts";
import { ANNOTATION_TYPES } from "./figures/shared.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "./spec/prompt.ts";
import { WhiteboardOutput } from "./schema.ts";
import {
  createGeneratedBoardSchema,
  type GeneratedFigure,
  generatedFigureSchema,
} from "./spec/schema.ts";
import { InvalidSpecOutput, type SpecGenerationEvent } from "./spec/index.ts";
import {
  semanticTargets,
  validateGeneratedBoard,
  WhiteboardSpecError,
} from "./spec/validation.ts";

function definition(type: FigureType) {
  return whiteboardFigures.find((d) => d.type === type)!;
}
function example(type: FigureType): GeneratedFigure {
  const d = definition(type);
  return generatedFigureSchema(d).parse(
    structuredClone({
      ...d.example.output,
      annotations: d.example.output.annotations ?? [],
    }),
  );
}
function board(...figures: GeneratedFigure[]) {
  return { title: null, figures };
}
function scores(
  types: FigureType[] = [],
  title = 0,
): WhiteboardGoalClassification {
  return Object.fromEntries([
    ["needs_board_title", title],
    ...whiteboardFigures.map((
      d,
    ) => [`needs_${d.type}`, types.includes(d.type) ? 1 : 0]),
  ]) as WhiteboardGoalClassification;
}
function math(id = "math"): GeneratedFigure {
  return {
    type: "math_expressions",
    id,
    title: null,
    annotations: [],
    expressions: [{ id: "answer", latex: "x=8" }],
  };
}
function text(
  role: "note" | "question" | "takeaway",
  id: string = role,
): GeneratedFigure {
  return {
    type: "text",
    id,
    title: null,
    annotations: [],
    role,
    text: "Explain the result.",
  };
}
function validate(
  source: unknown,
  types: FigureType[] = whiteboardFigures.map((d) => d.type),
) {
  return validateGeneratedBoard(source, types.map(definition), false);
}

for (const d of whiteboardFigures) {
  Deno.test(`${d.type}: selected schema, examples, targets, and placement`, () => {
    const figure = example(d.type);
    const schema = createGeneratedBoardSchema([d], false);
    const content = board(figure);
    assert(schema.safeParse(content).success);
    const { spec } = validate(content, [d.type]);
    assertEquals(spec.figures[0].id, figure.id);
    assertEquals(spec.figures[0].anchor, null);
    assertEquals(spec.figures[0].side, null);
    assert(WhiteboardOutput.safeParse(spec).success);
    const system = WHITEBOARD_SPEC_SYSTEM_PROMPT({ availableFigures: [d] });
    const snippets = [...system.matchAll(/```json\n([\s\S]*?)\n```/g)].map((
      m,
    ) => JSON.parse(m[1]));
    assertEquals(snippets.length, 2);
    assert(generatedFigureSchema(d).safeParse(snippets[0]).success);
    assert(schema.safeParse(snippets[1]).success);
    for (
      const other of whiteboardFigures.filter((other) => other.type !== d.type)
    ) {
      assert(!system.includes(`## ${other.type}\n`));
      assert(!schema.safeParse(board(example(other.type))).success);
    }
    const json = z.toJSONSchema(schema);
    assert(!JSON.stringify(json).includes('"oneOf"'));
    const jsonFigure = json.properties!.figures as {
      items: { properties: Record<string, unknown>; required: string[] };
    };
    const properties = jsonFigure.items.properties;
    assert(properties && !("anchor" in properties) && !("side" in properties));
    assert(properties.id);
    assert(jsonFigure.items.required.includes("annotations"));
    const titled = { ...figure, title: "Heading" };
    const targets = semanticTargets(titled, d);
    assertEquals(targets.get(`${figure.id}.title`), "text");
    assert(
      !semanticTargets({ ...figure, title: null }, d).has(`${figure.id}.title`),
    );
    for (const type of ANNOTATION_TYPES) {
      // Short (`title`) and canonical (`<figureId>.title`) references both resolve.
      for (const target of ["title", `${figure.id}.title`]) {
        const annotated = {
          ...titled,
          annotations: [{
            type,
            targetIds: [target],
            text: type === "callout" ? "Look here" : null,
          }],
        };
        validate(board(annotated), [d.type]);
      }
    }
  });
}

Deno.test("classification thresholds, no-match error, and invalid probabilities", () => {
  const boundary = scores();
  boundary.needs_math_expressions = 0.6;
  boundary.needs_board_title = 0.7;
  const noMatch = assertThrows(
    () => selectFigures(boundary),
    WhiteboardSpecError,
  );
  assertEquals(noMatch.issues[0].code, "NO_FIGURE_MATCH");
  boundary.needs_math_expressions = 0.6001;
  boundary.needs_board_title = 0.7001;
  const selected = selectFigures(boundary);
  assertEquals(selected.availableFigures.map((d) => d.type), [
    "math_expressions",
  ]);
  assert(selected.showTitle);
  assertThrows(() => selectFigures(scores()), WhiteboardSpecError);
  for (const invalid of [NaN, Infinity, -0.1, 1.01, undefined]) {
    assertThrows(
      () => parseClassification({ ...scores(), needs_text: invalid }),
      z.ZodError,
    );
  }
});

Deno.test("required IDs and annotations; no model placement or unknown board fields", () => {
  const schema = createGeneratedBoardSchema([...whiteboardFigures], false);
  for (const d of whiteboardFigures) {
    const figure = example(d.type);
    const { id: _id, ...missingId } = figure;
    const { annotations: _annotations, ...missingAnnotations } = figure;
    assert(!schema.safeParse({ title: null, figures: [missingId] }).success);
    assert(
      !schema.safeParse({ title: null, figures: [missingAnnotations] }).success,
    );
    assert(
      !schema.safeParse({ title: null, figures: [{ ...figure, anchor: null }] })
        .success,
    );
  }
  const chart = example("xy_chart");
  assert(chart.type === "xy_chart");
  const raw = structuredClone(chart) as unknown as {
    series: { id?: string; points: { id?: string }[] }[];
  };
  delete raw.series[0].points[0].id;
  assert(!schema.safeParse({ title: null, figures: [raw] }).success);
  delete raw.series[0].id;
  assert(!schema.safeParse({ title: null, figures: [raw] }).success);
  assert(!schema.safeParse({ ...board(math()), layout: "grid" }).success);
});

Deno.test("title policy and all-catalog anyOf schema", () => {
  const yes = createGeneratedBoardSchema([...whiteboardFigures], true);
  const no = createGeneratedBoardSchema([...whiteboardFigures], false);
  assert(!yes.safeParse(board(math())).success);
  for (const title of ["", "   "]) {
    assert(!yes.safeParse({ ...board(math()), title }).success);
  }
  assert(yes.safeParse({ ...board(math()), title: "Equations" }).success);
  assert(!no.safeParse({ ...board(math()), title: "Equations" }).success);
  const json = JSON.stringify(z.toJSONSchema(yes));
  assert(json.includes('"anyOf"'));
  assert(!json.includes('"oneOf"'));
});

Deno.test("reading order and deterministic placement preserve IDs", () => {
  const { spec } = validate(
    board(
      text("question"),
      text("question", "second-question"),
      math(),
      text("note"),
      text("takeaway"),
    ),
  );
  assertEquals(
    spec.figures.map(({ id, anchor, side }) => ({ id, anchor, side })),
    [
      { id: "question", anchor: null, side: null },
      { id: "second-question", anchor: "question", side: "bottom" },
      { id: "math", anchor: "second-question", side: "bottom" },
      { id: "note", anchor: "math", side: "bottom" },
      { id: "takeaway", anchor: "note", side: "bottom" },
    ],
  );
  validate(board(text("note"), text("question"), text("takeaway")));
  for (
    const figures of [[text("note"), math()], [math(), text("question")], [
      text("question"),
      text("note"),
      math(),
    ]]
  ) {
    assertThrows(() => validate(board(...figures)), WhiteboardSpecError);
  }
  assertThrows(() => validate(board(math(), math())), WhiteboardSpecError);
});

Deno.test("semantic IDs, chart data, and figure refinements", () => {
  const duplicate = math();
  assert(duplicate.type === "math_expressions");
  duplicate.expressions.push({ ...duplicate.expressions[0] });
  assertThrows(() => validate(board(duplicate)), WhiteboardSpecError);
  const xy = example("xy_chart");
  assert(xy.type === "xy_chart");
  const duplicatePoint = structuredClone(xy);
  duplicatePoint.series[0].points[0].id = duplicatePoint.series[0].id;
  const duplicateError = assertThrows(
    () => validate(board(duplicatePoint)),
    WhiteboardSpecError,
  );
  assertEquals(duplicateError.issues[0].path, [
    "figures",
    0,
    "series",
    0,
    "points",
    0,
    "id",
  ]);
  for (const x of ["category", NaN, Infinity]) {
    const invalid = structuredClone(xy);
    invalid.series[0].points[0].x = x;
    assertThrows(() => validate(board(invalid)), WhiteboardSpecError);
  }
  const bar = structuredClone(xy);
  bar.chartStyle = "bar";
  bar.series[0].points[1].x = bar.series[0].points[0].x;
  assertThrows(() => validate(board(bar)), WhiteboardSpecError);
  const geo = example("geometry");
  assert(geo.type === "geometry");
  geo.objects.push({
    id: "bad",
    kind: "segment",
    points: ["missing", "also-missing"],
  });
  assertThrows(() => validate(board(geo)), WhiteboardSpecError);
  const coordinate = example("coordinate_plot");
  assert(coordinate.type === "coordinate_plot");
  coordinate.elements.push({
    type: "function",
    id: "invalid",
    expression: "eval(x)",
  });
  const expressionError = assertThrows(
    () => validate(board(coordinate)),
    WhiteboardSpecError,
  );
  assert(expressionError.issues.some((i) => i.path.at(-1) === "expression"));
});

Deno.test("annotation target ownership, parts, counts, and text", () => {
  const m = math();
  for (
    const target of [
      "other.answer.expression",
      "answer.term",
      "math.answer.term",
      "title",
      "math.title",
    ]
  ) {
    const error = assertThrows(
      () =>
        validate(
          board({
            ...m,
            annotations: [{ type: "highlight", targetIds: [target], text: null }],
          }),
        ),
      WhiteboardSpecError,
    );
    assertEquals(error.issues[0].code, "UNKNOWN_TARGET");
    assertEquals(error.issues[0].annotationIndex, 0);
    assertEquals(error.issues[0].figureId, "math");
    assertEquals(error.issues[0].availableTargetIds, ["answer"]);
  }
  // A bare element ID, `<element>.<part>`, and the canonical form all name the row.
  for (
    const target of ["answer", "answer.expression", "math.answer.expression"]
  ) {
    validate(
      board({
        ...m,
        annotations: [{ type: "highlight", targetIds: [target], text: null }],
      }),
    );
  }
  for (
    const annotation of [
      { type: "callout", targetIds: ["answer"], text: null },
      { type: "number", targetIds: ["answer"], text: "1" },
      { type: "highlight", targetIds: ["answer"], text: "Wrong" },
      { type: "strikeout", targetIds: ["answer"], text: "Wrong" },
      { type: "highlight", targetIds: ["answer", "answer"], text: null },
      { type: "group", targetIds: ["answer", "answer"], text: null },
    ]
  ) {
    assertThrows(
      () =>
        validate({
          title: null,
          figures: [{ ...m, annotations: [annotation] }],
        }),
      WhiteboardSpecError,
    );
  }
  // Marks and text targets accept every intent; the renderer picks the mark.
  const xy = example("xy_chart");
  assert(xy.type === "xy_chart");
  for (const type of ANNOTATION_TYPES) {
    validate(
      board({
        ...xy,
        annotations: [{
          type,
          targetIds: [xy.series[0].points[0].id],
          text: type === "callout" ? "Here" : null,
        }],
      }),
    );
  }
  // A bare slice ID means the wedge; parts are addressed explicitly.
  const pie = example("pie_chart");
  assert(pie.type === "pie_chart");
  const slice = pie.slices[0].id;
  validate(
    board({
      ...pie,
      annotations: [
        { type: "highlight", targetIds: [slice], text: null },
        { type: "highlight", targetIds: [`${slice}.legend-label`], text: null },
        { type: "strikeout", targetIds: [`${slice}.percentage`], text: null },
      ],
    }),
  );
  const grouped = math();
  assert(grouped.type === "math_expressions");
  grouped.expressions.push({ id: "other", latex: "2x=16" });
  grouped.annotations = [
    { type: "group", targetIds: ["answer", "other"], text: null },
    { type: "number", targetIds: ["answer", "other"], text: null },
  ];
  validate(board(grouped));
});

Deno.test("conditional targets: coordinate labels and geometry marking labels; percentages always resolve", () => {
  const pie = example("pie_chart");
  assert(pie.type === "pie_chart");
  pie.slices = [{ id: "small", label: "Small", value: 7 }, {
    id: "rest",
    label: "Rest",
    value: 93,
  }];
  pie.annotations = [{
    type: "highlight",
    targetIds: ["small.percentage"],
    text: null,
  }];
  validate(board(pie));
  const plot = example("coordinate_plot");
  assert(plot.type === "coordinate_plot");
  plot.elements = [{ type: "point", id: "point", position: [0, 0] }];
  plot.annotations = [{
    type: "highlight",
    targetIds: ["point.label"],
    text: null,
  }];
  assertThrows(() => validate(board(plot)), WhiteboardSpecError);
  plot.elements[0].label = "Origin";
  validate(board(plot));
  const geometry = example("geometry");
  assert(geometry.type === "geometry");
  geometry.markings = [{
    id: "angle",
    kind: "angle",
    points: ["a", "b", "c"],
    sweep: "minor",
  }];
  geometry.annotations = [{
    type: "highlight",
    targetIds: ["angle.label"],
    text: null,
  }];
  assertThrows(() => validate(board(geometry)), WhiteboardSpecError);
  assert(geometry.markings[0].kind === "angle");
  geometry.markings[0].latex = "\\theta";
  validate(board(geometry));
});

Deno.test("orchestration: single classifier/generator, mode and orientation, no external dependencies", async () => {
  let classifications = 0, generations = 0;
  const events: SpecGenerationEvent[] = [];
  for (const mode of ["fast", "smart"] as const) {
    const result = await whiteboardSpecWith({
      goal: "  Solve x  ",
      mode,
      orientation: "landscape",
      format: "svg",
    }, {
      classify: (goal) => {
        classifications++;
        assertEquals(goal, "Solve x");
        return Promise.resolve(scores(["math_expressions"]));
      },
      generate: (request) => {
        generations++;
        assertEquals(request.input.mode, mode);
        assertEquals(request.availableFigures.map((d) => d.type), [
          "math_expressions",
        ]);
        assertEquals(request.repair, undefined);
        return Promise.resolve({ output: board(math()) });
      },
      report: (event) => events.push(event),
    });
    assertEquals(result.figures[0].id, "math");
  }
  assertEquals([classifications, generations], [2, 2]);
  assertEquals(events.map((e) => e.outcome), [
    "success",
    "success",
    "success",
    "success",
  ]);
});

Deno.test("orchestration: no-match, input/classifier failures, and no repair for operational failures", async () => {
  const unexpected = () => {
    throw new Error("Unexpected call");
  };
  const noMatch = await assertRejects(
    () =>
      whiteboardSpecWith({ goal: "Show something" }, {
        classify: () => Promise.resolve(scores()),
        generate: unexpected,
      }),
    WhiteboardSpecError,
  );
  assertEquals(noMatch.issues[0].code, "NO_FIGURE_MATCH");
  await assertRejects(
    () =>
      whiteboardSpecWith({ goal: "   " }, {
        classify: unexpected,
        generate: unexpected,
      }),
    WhiteboardSpecError,
  );
  await assertRejects(() =>
    whiteboardSpecWith({ goal: "Show" }, {
      classify: () => Promise.resolve({ ...scores(), needs_text: NaN }),
      generate: unexpected,
    }), WhiteboardSpecError);
  for (const stage of ["classify", "generate"] as const) {
    let calls = 0;
    const failure = new Error("Transport or authentication failure");
    try {
      await whiteboardSpecWith({ goal: "Show" }, {
        classify: () => {
          if (stage === "classify") {
            calls++;
            throw failure;
          }
          return Promise.resolve(scores(["math_expressions"]));
        },
        generate: () => {
          calls++;
          throw failure;
        },
      });
      throw new Error("Expected failure");
    } catch (error) {
      assert(error === failure);
    }
    assertEquals(calls, 1);
  }
});

Deno.test("orchestration: one correction with original policy and actionable issues", async () => {
  let calls = 0;
  const bad = {
    ...math(),
    annotations: [{
      type: "highlight" as const,
      targetIds: ["answer.wrong"],
      text: null,
    }],
  };
  const result = await whiteboardSpecWith({ goal: "Solve x", mode: "fast" }, {
    classify: () => Promise.resolve(scores(["math_expressions"])),
    generate: (request) => {
      calls++;
      if (calls === 1) return Promise.resolve({ output: board(bad) });
      assertEquals(request.input.mode, "fast");
      assertEquals(request.showTitle, false);
      assertEquals(request.repair?.previous, board(bad));
      assertEquals(request.repair?.issues[0].path, [
        "figures",
        0,
        "annotations",
        0,
        "targetIds",
        0,
      ]);
      assert(request.schema.safeParse(board(math())).success);
      return Promise.resolve({
        output: board({
          ...bad,
          annotations: [{
            ...bad.annotations[0],
            targetIds: ["answer"],
          }],
        }),
      });
    },
  });
  assertEquals(calls, 2);
  assertEquals(result.figures[0].annotations?.length, 1);
});

Deno.test("orchestration: malformed JSON correction and exhausted validation", async () => {
  let calls = 0;
  await whiteboardSpecWith({ goal: "Solve" }, {
    classify: () => Promise.resolve(scores(["math_expressions"])),
    generate: () => {
      if (++calls === 1) throw new InvalidSpecOutput('{"title":');
      return Promise.resolve({ output: board(math()) });
    },
  });
  assertEquals(calls, 2);
  calls = 0;
  await assertRejects(() =>
    whiteboardSpecWith({ goal: "Solve" }, {
      classify: () => Promise.resolve(scores(["math_expressions"])),
      generate: () => {
        calls++;
        return Promise.resolve({ output: { title: null, figures: [] } });
      },
    }), WhiteboardSpecError);
  assertEquals(calls, 2);
});

Deno.test("repair cannot delete content, change unaffected facts, or remove annotations", () => {
  const previous = board(math(), math("second"));
  previous.figures[0].annotations = [{
    type: "highlight",
    targetIds: ["answer.bad"],
    text: null,
  }];
  const repair = {
    previous,
    issues: [{
      code: "UNKNOWN_TARGET" as const,
      path: ["figures", 0, "annotations", 0, "targetIds", 0],
      message: "Bad target",
    }],
  };
  const corrected = structuredClone(previous);
  corrected.figures[0].annotations[0].targetIds[0] = "answer";
  assertRepairPreservesContent(repair, corrected);
  const removed = structuredClone(corrected);
  removed.figures.pop();
  assertThrows(
    () => assertRepairPreservesContent(repair, removed),
    WhiteboardSpecError,
  );
  const removedAnnotation = structuredClone(corrected);
  removedAnnotation.figures[0].annotations = [];
  assertThrows(
    () => assertRepairPreservesContent(repair, removedAnnotation),
    WhiteboardSpecError,
  );
  const changed = structuredClone(corrected);
  assert(changed.figures[1].type === "math_expressions");
  changed.figures[1].expressions[0].latex = "x=99";
  assertThrows(
    () => assertRepairPreservesContent(repair, changed),
    WhiteboardSpecError,
  );
});

Deno.test("correction can fix a duplicate figure ID and its dependent annotation references", async () => {
  const first = math();
  const second = math();
  // Canonical references carry the figure ID and must follow a figure rename.
  second.annotations = [{
    type: "highlight",
    targetIds: ["math.answer.expression"],
    text: null,
  }];
  let calls = 0;
  const result = await whiteboardSpecWith({ goal: "Show two steps" }, {
    classify: () => Promise.resolve(scores(["math_expressions"])),
    generate: () => {
      calls++;
      return Promise.resolve({
        output: calls === 1 ? board(first, second) : board(first, {
          ...second,
          id: "second",
          annotations: [{
            type: "highlight",
            targetIds: ["second.answer.expression"],
            text: null,
          }],
        }),
      });
    },
  });
  assertEquals(calls, 2);
  assertEquals(result.figures[1].id, "second");
});

Deno.test("validation reports independent title, annotation, and ordering issues together", () => {
  const figure = math();
  figure.annotations = [{
    type: "highlight",
    targetIds: ["missing"],
    text: null,
  }];
  const error = assertThrows(
    () => validate({ ...board(figure, text("question")), title: "Forbidden" }),
    WhiteboardSpecError,
  );
  assert(error.issues.some((i) => i.path[0] === "title"));
  assert(error.issues.some((i) => i.code === "UNKNOWN_TARGET"));
  assert(error.issues.some((i) => i.path.at(-1) === "role"));
});

Deno.test("public entry point imports and validates input without provider credentials", async () => {
  const { whiteboardSpec } = await import("./index.ts");
  await assertRejects(() => whiteboardSpec({ goal: " " }), WhiteboardSpecError);
});

Deno.test("repair can fix annotation target count without removing the annotation", async () => {
  const figure = math();
  figure.annotations = [{
    type: "highlight",
    targetIds: ["answer", "answer"],
    text: null,
  }];
  let calls = 0;
  await whiteboardSpecWith({ goal: "Highlight the answer" }, {
    classify: () => Promise.resolve(scores(["math_expressions"])),
    generate: () => {
      const output = board(structuredClone(figure));
      if (++calls === 2) output.figures[0].annotations[0].targetIds.pop();
      return Promise.resolve({ output });
    },
  });
  assertEquals(calls, 2);
});
