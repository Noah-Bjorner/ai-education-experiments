/**
 * Run from this directory: deno run --allow-read=fonts --allow-write graphs-test.ts
 * Check behavior:          deno test --allow-read=fonts graphs-test.ts
 * No AI calls, API keys, browser, or uploads. Edit the examples below and rerun.
 */
import { type Graph, renderGraphSvg } from "./graphs.ts";
import { fitGraphText, measureGraphText } from "./font.ts";

export const examples: Graph[] = [
  {
    type: "xy_chart",
    title: "Population of France",
    chartStyle: "line",
    xLabel: "Year",
    yLabel: "Population",
    series: [{
      name: "Population",
      points: [{ x: 1950, y: 41800000 }, { x: 1975, y: 52600000 }],
    }],
  },
  {
    type: "pie_chart",
    title: "Book collection",
    slices: [
      { label: "Fiction", value: 12 },
      { label: "Nonfiction", value: 6 },
      { label: "Poetry", value: 2 },
    ],
  },
];

if (import.meta.main) {
  for (const [index, chart] of examples.entries()) {
    const startedAt = performance.now();
    const { svg, width, height } = renderGraphSvg(chart, {
      id: `graph-${index}`,
      width: 800,
      height: 520,
      roughness: 1.5,
      hatchGap: 9,
      seed: 10,
    });
    const output = new URL(
      `./graph-${index + 1}-${chart.type}.svg`,
      import.meta.url,
    );
    await Deno.writeTextFile(output, svg);
    const elapsedMs = performance.now() - startedAt;
    console.log(
      `Wrote ${output.pathname} (${width} × ${height}) in ${
        elapsedMs.toFixed(1)
      }ms`,
    );
  }
}

// Small behavior checks; the SVG files above are the visual examples.
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Inspect geometry attributes, not text or embedded font bytes: base64 can
// legitimately contain the substring "NaN".
function hasFiniteGeometry(svg: string): boolean {
  const coordinates = svg.matchAll(
    /\b(?:d|x|y|x1|x2|y1|y2|cx|cy|r|width|height|viewBox|transform)="([^"]*)"/g,
  );
  return [...coordinates].every((match) => !/NaN|Infinity/.test(match[1]));
}

Deno.test("France chart preserves the provided data and renders reproducibly", () => {
  const before = JSON.stringify(examples[0]);
  const a = renderGraphSvg(examples[0], { id: "france" }).svg;
  assert(
    a === renderGraphSvg(examples[0], { id: "france" }).svg,
    "Rendering should be deterministic",
  );
  assert(
    JSON.stringify(examples[0]) === before,
    "Rendering must not mutate input",
  );
  for (
    const label of [
      "1950",
      "1975",
      "41,800,000",
      "52,600,000",
      "Population of France",
    ]
  ) {
    assert(a.includes(label), `Missing ${label}`);
  }
  assert(hasFiniteGeometry(a), "Coordinates must be finite");
});

Deno.test("line charts handle single points, flat data, negative values, and sorting", () => {
  for (const points of [[{ x: 3, y: 0 }], [{ x: 5, y: -2 }, { x: 1, y: -2 }]]) {
    const chart: Graph = {
      type: "xy_chart",
      title: "Edge case",
      chartStyle: "line",
      xLabel: "X",
      yLabel: "Y",
      series: [{ name: "A", points }],
    };
    const before = JSON.stringify(chart);
    const { svg } = renderGraphSvg(chart, { id: "edge" });
    assert(hasFiniteGeometry(svg), "Coordinates must be finite");
    assert(
      JSON.stringify(chart) === before,
      "Sorting must not change the input",
    );
    const markers = [...svg.matchAll(/<circle cx="([^"]+)"/g)].map((m) =>
      Number(m[1])
    );
    assert(
      markers.every((x, i) => i === 0 || x >= markers[i - 1]),
      "Points must be ordered by X",
    );
  }
});

Deno.test("pie normalizes values, supports a majority slice, and isolates clipping IDs", () => {
  const { svg } = renderGraphSvg(examples[1], { id: "books" });
  for (const percent of ["60%", "30%", "10%"]) {
    assert(svg.includes(percent), `Missing ${percent}`);
  }
  assert(/ A [\d.]+ [\d.]+ 0 1 1 /.test(svg), "60% slice must use a large arc");
  const combined = svg + renderGraphSvg(examples[1], { id: "books-other" }).svg;
  const ids = [...combined.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert(
    new Set(ids).size === ids.length,
    "Clip IDs must not collide between graphs",
  );
  for (const match of combined.matchAll(/url\(#([^)]+)\)/g)) {
    assert(ids.includes(match[1]), "Clip reference must resolve");
  }
});

Deno.test("invalid and unsupported data fails explicitly", () => {
  const charts: Graph[] = [
    {
      type: "xy_chart",
      title: "Bad",
      chartStyle: "bar",
      xLabel: "X",
      yLabel: "Y",
      series: [],
    },
    {
      type: "xy_chart",
      title: "Bad",
      chartStyle: "line",
      xLabel: "X",
      yLabel: "Y",
      series: [{ name: "A", points: [{ x: "Monday", y: 1 }] }],
    },
    {
      type: "xy_chart",
      title: "Bad",
      chartStyle: "line",
      xLabel: "X",
      yLabel: "Y",
      series: [{ name: "A", points: [{ x: 1, y: NaN }] }],
    },
    {
      type: "pie_chart",
      title: "Bad",
      slices: [{ label: "A", value: 0 }, { label: "B", value: 1 }],
    },
    {
      type: "pie_chart",
      title: "Bad",
      slices: [{ label: "A", value: -1 }, { label: "B", value: 1 }],
    },
  ];
  for (const chart of charts) {
    let rejected = false;
    try {
      renderGraphSvg(chart, { id: "invalid" });
    } catch {
      rejected = true;
    }
    assert(rejected, "Invalid chart should throw");
  }
});

Deno.test("chart labels are XML-escaped", () => {
  const chart = { ...examples[0], title: '<script>alert("x")</script> & data' };
  const { svg } = renderGraphSvg(chart, { id: "escaped" });
  assert(!svg.includes("<script>"), "Labels must never become SVG elements");
  assert(svg.includes("&lt;script&gt;"), "Label text should be escaped");
});

Deno.test("each standalone SVG carries one WOFF2 font and its license", () => {
  for (const example of examples) {
    const { svg } = renderGraphSvg(example, { id: "font-check" });
    const fonts = [
      ...svg.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g),
    ];
    assert(
      fonts.length === 1,
      "Embed the font once, not once per label or slice",
    );
    assert(
      atob(fonts[0][1]).startsWith("wOF2"),
      "Embedded bytes must be a WOFF2 font",
    );
    assert(svg.includes("Shantell Sans"), "Graph text must use Shantell Sans");
    assert(svg.includes("font-weight:500"), "Use the uploaded Medium weight");
    assert(
      svg.includes("SIL OPEN FONT LICENSE"),
      "Export must retain the font license",
    );
    assert(
      !/url\(["']?https?:/.test(svg),
      "Font must work without an external request",
    );
  }
});

Deno.test("pie slices use separate hatch geometry with translucent fill layers", () => {
  const { svg } = renderGraphSvg(examples[1], { id: "fills" });
  const paths = [
    ...svg.matchAll(
      /<path d="([^"]+)" clip-path="url\(#fills-slice-\d+-clip\)"[^>]+/g,
    ),
  ];
  assert(paths.length === 3, "Each slice needs its own hatch path");
  assert(
    new Set(paths.map((p) => p[1])).size === 3,
    "Hatch lines must not continue unchanged across slice boundaries",
  );
  assert(
    paths.every((p) => p[0].includes('stroke-opacity="0.5"')),
    "Hatch strokes use 50% opacity",
  );
  assert(
    (svg.match(/fill-opacity="0.05"/g) ?? []).length === 6,
    "Each slice and legend swatch needs a 5% color wash",
  );
});

Deno.test("font metrics distinguish wide letters and preserve Swedish text", () => {
  assert(
    measureGraphText("WWW", 16) > measureGraphText("iii", 16),
    "Measure glyphs, not character counts",
  );
  assert(
    fitGraphText("ÅÄÖ åäö", 16, 200) === "ÅÄÖ åäö",
    "Keep supported Swedish characters",
  );
  assert(
    measureGraphText("A\u030A", 16) === measureGraphText("Å", 16),
    "Normalize decomposed characters",
  );
  const fitted = fitGraphText("Population of France", 25, 100);
  assert(
    fitted.endsWith("…") && measureGraphText(fitted, 25) <= 100,
    "Truncated text must fit its allocation",
  );
});
