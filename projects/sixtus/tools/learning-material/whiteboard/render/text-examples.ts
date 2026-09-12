import { type TextFigure, textFigure } from "../figures/text.ts";
import { xyChart } from "../figures/xy-chart.ts";
import { WhiteboardOutput, type WhiteboardSpec } from "../schema.ts";

export function textExample(
  role: TextFigure["role"],
  text: string,
): TextFigure {
  return { ...textFigure.example.output, id: role, role, text };
}

const fruit = {
  ...xyChart.example.output,
  id: "fruit",
  title: "Fruit counts",
  chartStyle: "bar" as const,
  xLabel: "Fruit",
  yLabel: "Count",
  series: [{
    id: "quantity",
    name: "Quantity",
    points: [
      { id: "apples", x: "Apples", y: 4 },
      { id: "oranges", x: "Oranges", y: 6 },
    ],
  }],
};

export const normalTextBoard = WhiteboardOutput.parse({
  title: null,
  figures: [
    {
      ...textExample(
        "question",
        "How many more oranges than apples are there?",
      ),
      anchor: null,
      side: null,
    },
    { ...fruit, anchor: "question", side: "bottom" },
    {
      ...textExample("note", "Compare the heights of the two bars."),
      anchor: "fruit",
      side: "bottom",
    },
    {
      ...textExample("takeaway", "There are 2 more oranges than apples."),
      anchor: "note",
      side: "bottom",
    },
  ],
});

export const hardTextBoard = WhiteboardOutput.parse({
  title: "Reading a comparison",
  figures: [
    {
      ...textExample(
        "question",
        "There are 4 apples and 6 oranges. How many more oranges are there?\n\nExplain how the bars support your answer, then check the difference by subtraction.",
      ),
      title:
        "Compare the two quantities and explain the difference in your own words",
      anchor: null,
      side: null,
    },
    { ...fruit, anchor: "question", side: "bottom" },
    {
      ...textExample(
        "note",
        'Keep the labels "Apples" & "Oranges" with their values.\n\n4 < 6, so the orange bar is taller. Read both bars from the same baseline.\nA long unbroken label also wraps: ' +
          "abcdefghijklmnopqrstuvwxyz".repeat(5),
      ),
      annotations: [{
        type: "arrow",
        targetIds: ["note.text"],
        content: "Both bars start at zero.",
      }],
      anchor: "fruit",
      side: "bottom",
    },
    {
      ...textExample(
        "takeaway",
        "6 − 4 = 2. There are 2 more oranges than apples.\n\nThe difference compares the counts; it does not give their total.\nSwedish text is preserved too: äpplen, päron, blåbär.",
      ),
      annotations: [{
        type: "box",
        targetIds: ["takeaway.text"],
        content: null,
      }],
      anchor: "note",
      side: "bottom",
    },
  ],
});

export const textExamples: { id: string; board: WhiteboardSpec }[] = [
  { id: "normal", board: normalTextBoard },
  { id: "hard", board: hardTextBoard },
  {
    id: "content-widths",
    board: WhiteboardOutput.parse({
      title: null,
      figures: [
        {
          ...textExample("note", "4 < 6"),
          id: "short",
          anchor: null,
          side: null,
        },
        {
          ...textExample("note", "4 apples\n6 oranges"),
          id: "multiline",
          anchor: "short",
          side: "bottom",
        },
        {
          ...textExample(
            "note",
            "There are 4 apples and 6 oranges. To find how many more oranges there are, subtract the smaller count from the larger count: 6 − 4 = 2.",
          ),
          id: "wrapped",
          anchor: "multiline",
          side: "bottom",
        },
      ],
    }),
  },
  ...(["note", "question", "takeaway"] as const).map((role) => ({
    id: role,
    board: WhiteboardOutput.parse({
      title: null,
      figures: [{
        ...textExample(role, "The same text and size for every role."),
        anchor: null,
        side: null,
      }],
    }),
  })),
];
