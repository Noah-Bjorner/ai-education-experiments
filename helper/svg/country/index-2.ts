import {
  type Feature,
  type GeoJSON,
  getHistoricalBasemaps,
  type HistoricalBasemapOptions,
  type LinearRing,
  type Position,
} from "./historical-basemaps.ts";

type Bounds = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

const WIDTH = 800;
const HEIGHT = 450;
const PADDING = 16;

const FILLS = [
  "#1d4ed8",
  "#b45309",
  "#15803d",
  "#7c3aed",
  "#be123c",
  "#0f766e",
  "#a16207",
  "#1e3a8a",
];

export function historicalBasemapToSvg(geojson: GeoJSON): string {
  if (geojson.features.length === 0) {
    throw new Error("No historical basemap features to render");
  }

  const bounds = getFeatureBounds(geojson.features);
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 1);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1);
  const scale = Math.min(
    (WIDTH - PADDING * 2) / lonSpan,
    (HEIGHT - PADDING * 2) / latSpan,
  );
  const xOffset = (WIDTH - lonSpan * scale) / 2;
  const yOffset = (HEIGHT - latSpan * scale) / 2;

  const project = ([lon, lat]: Position) => {
    const x = xOffset + (lon - bounds.minLon) * scale;
    const y = yOffset + (bounds.maxLat - lat) * scale;
    return `${round(x)} ${round(y)}`;
  };

  const paths = geojson.features.flatMap((feature, index) => {
    const d = getRings(feature).flatMap((ring) => {
      if (ring.length < 4) return [];
      return [`M${ring.map(project).join("L")}Z`];
    }).join("");

    if (d.length === 0) return [];

    const name = feature.properties.NAME ?? feature.properties.ABBREVN ?? "";
    const id = feature.properties.ABBREVN ?? name;
    const idAttr = id ? ` id="${escapeXml(id)}"` : "";
    const fill = FILLS[index % FILLS.length];

    return [
      `<path${idAttr} d="${d}" fill="${fill}" stroke="#ffffff" stroke-width="1"><title>${
        escapeXml(name)
      }</title></path>`,
    ];
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" overflow="hidden" role="img">${paths}</svg>`;
}

export async function renderHistoricalBasemap(
  options: HistoricalBasemapOptions,
  outputName = "map-2.svg",
): Promise<string> {
  const geojson = await getHistoricalBasemaps(options);
  const svg = historicalBasemapToSvg(geojson);
  const output = new URL("./output-ex/", import.meta.url);
  await Deno.mkdir(output, { recursive: true });
  const file = new URL(outputName, output);
  await Deno.writeTextFile(file, svg);
  console.log(`Wrote ${file.pathname}`);
  return svg;
}

function getRings(feature: Feature): LinearRing[] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates;
  }

  return feature.geometry.coordinates.flat();
}

function getFeatureBounds(features: Feature[]): Bounds {
  const bounds = {
    minLon: Infinity,
    minLat: Infinity,
    maxLon: -Infinity,
    maxLat: -Infinity,
  };

  for (const feature of features) {
    for (const ring of getRings(feature)) {
      for (const [lon, lat] of ring) {
        bounds.minLon = Math.min(bounds.minLon, lon);
        bounds.minLat = Math.min(bounds.minLat, lat);
        bounds.maxLon = Math.max(bounds.maxLon, lon);
        bounds.maxLat = Math.max(bounds.maxLat, lat);
      }
    }
  }

  return bounds;
}

function round(value: number) {
  return Number(value.toFixed(1));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
