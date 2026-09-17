import { assert, assertEquals } from "@std/assert";
import { whiteboardFigures } from "../figures/index.ts";
import { generatedFigureSchema } from "./schema.ts";
import { semanticTargets } from "./validation.ts";
import { prepareFigure } from "../render/prepare.ts";

// Rendering here is a contract regression, never part of whiteboardSpec.
for (const definition of whiteboardFigures) {
  Deno.test(`semantic target catalog agrees with visible renderer example: ${definition.type}`, () => {
    const figure = generatedFigureSchema(definition).parse({
      ...definition.example.output,
      title: "Heading",
      annotations: [],
    });
    const prepared = prepareFigure(figure, { id: figure.id });
    assert(prepared.ok);
    const actual = [...prepared.figure.base.targets].map((
      [id, target],
    ) => [id, target.kind]).sort();
    assertEquals([...semanticTargets(figure, definition)].sort(), actual);
  });
}
