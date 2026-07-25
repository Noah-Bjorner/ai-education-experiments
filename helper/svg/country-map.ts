import { z } from "@zod";

export const regionSchema = z.enum([
  "world",
  "africa",
  "antarctica",
  "asia",
  "australia-new-zealand",
  "balkans",
  "baltics",
  "british-isles",
  "caribbean",
  "central-africa",
  "central-america",
  "central-asia",
  "central-europe",
  "contiguous-us",
  "east-africa",
  "east-asia",
  "east-europe",
  "europe",
  "iberia",
  "mediterranean",
  "melanesia",
  "micronesia",
  "middle-east",
  "north-america",
  "north-africa",
  "north-europe",
  "northern-america",
  "nordics",
  "oceania",
  "polynesia",
  "scandinavia",
  "south-america",
  "south-asia",
  "south-europe",
  "southeast-asia",
  "southern-africa",
  "west-africa",
  "west-asia",
  "west-europe",
]);

const mapTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("countries"),
    countries: z.array(z.string().trim().min(1)).min(1).describe(
      "Country selectors matched case-insensitively by ISO 3166-1 alpha-2 code, ISO 3166-1 alpha-3 code, or English name, for example 'SE', 'SWE', or 'Sweden'.",
    ),
  }),
  z.object({
    type: z.literal("region"),
    region: regionSchema.describe(
      "Predefined region used to frame and crop the map view, for example 'nordics' or 'europe'.",
    ),
  }),
]);

export const mapOptionsSchema = z.object({
  target: mapTargetSchema,
  fidelity: z.enum(["low", "medium", "high"]),
});

export type MapOptions = z.input<typeof mapOptionsSchema>;
type ParsedMapOptions = z.infer<typeof mapOptionsSchema>;
type Region = z.infer<typeof regionSchema>;
type MapTarget = ParsedMapOptions["target"];

type Position = [number, number];
type Polygon = Position[][];
type MultiPolygon = Polygon[];

type Bounds = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

interface CountryFeature {
  type: "Feature";
  properties: Record<string, string>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: Polygon | MultiPolygon;
  };
}

interface FeatureCollection {
  type: "FeatureCollection";
  features: CountryFeature[];
}

const GISCO_RESOLUTION = {
  low: "60M",
  medium: "20M",
  high: "01M",
} as const;

const REGION_VIEW_BOUNDS = {
  africa: { minLon: -18, minLat: -35, maxLon: 52, maxLat: 38 },
  antarctica: { minLon: -180, minLat: -90, maxLon: 180, maxLat: -60 },
  asia: { minLon: 26, minLat: -10, maxLon: 150, maxLat: 75 },
  europe: { minLon: -25, minLat: 34, maxLon: 39, maxLat: 71 },
  "north-america": { minLon: -170, minLat: 7, maxLon: -50, maxLat: 72 },
  oceania: { minLon: 110, minLat: -48, maxLon: 180, maxLat: 5 },
  "south-america": { minLon: -82, minLat: -56, maxLon: -34, maxLat: 13 },
  "north-europe": { minLon: -25, minLat: 50, maxLon: 32, maxLat: 72 },
  "australia-new-zealand": {
    minLon: 110,
    minLat: -48,
    maxLon: 180,
    maxLat: -9,
  },
  balkans: { minLon: 12, minLat: 35, maxLon: 30, maxLat: 48 },
  baltics: { minLon: 20, minLat: 53, maxLon: 29, maxLat: 60 },
  "british-isles": { minLon: -11, minLat: 49, maxLon: 2, maxLat: 61 },
  caribbean: { minLon: -86, minLat: 9, maxLon: -58, maxLat: 27 },
  "central-africa": { minLon: 5, minLat: -14, maxLon: 32, maxLat: 24 },
  "central-america": { minLon: -93, minLat: 7, maxLon: -77, maxLat: 19 },
  "central-asia": { minLon: 46, minLat: 35, maxLon: 88, maxLat: 56 },
  "central-europe": { minLon: 5, minLat: 45, maxLon: 25, maxLat: 56 },
  "contiguous-us": { minLon: -125, minLat: 24, maxLon: -66, maxLat: 50 },
  "east-africa": { minLon: 21, minLat: -26, maxLon: 64, maxLat: 18 },
  "east-asia": { minLon: 73, minLat: 18, maxLon: 146, maxLat: 54 },
  "east-europe": { minLon: 14, minLat: 44, maxLon: 42, maxLat: 62 },
  iberia: { minLon: -10, minLat: 35, maxLon: 5, maxLat: 44 },
  mediterranean: { minLon: -10, minLat: 30, maxLon: 42, maxLat: 47 },
  melanesia: { minLon: 140, minLat: -25, maxLon: 180, maxLat: 5 },
  micronesia: { minLon: 130, minLat: -2, maxLon: 180, maxLat: 15 },
  "middle-east": { minLon: 24, minLat: 12, maxLon: 64, maxLat: 43 },
  "north-africa": { minLon: -18, minLat: 18, maxLon: 37, maxLat: 38 },
  "northern-america": {
    minLon: -170,
    minLat: 24,
    maxLon: -50,
    maxLat: 84,
  },
  nordics: { minLon: -25, minLat: 54, maxLon: 32, maxLat: 72 },
  polynesia: { minLon: 165, minLat: -25, maxLon: 180, maxLat: 0 },
  scandinavia: { minLon: 4, minLat: 54, maxLon: 32, maxLat: 72 },
  "south-asia": { minLon: 60, minLat: -1, maxLon: 98, maxLat: 38 },
  "south-europe": { minLon: -10, minLat: 36, maxLon: 25, maxLat: 46 },
  "southeast-asia": { minLon: 92, minLat: -12, maxLon: 142, maxLat: 24 },
  "southern-africa": { minLon: 11, minLat: -35, maxLon: 33, maxLat: -17 },
  "west-africa": { minLon: -26, minLat: 4, maxLon: 16, maxLat: 28 },
  "west-asia": { minLon: 25, minLat: 12, maxLon: 60, maxLat: 43 },
  "west-europe": { minLon: -6, minLat: 42, maxLon: 16, maxLat: 56 },
} as const satisfies Record<Exclude<Region, "world">, Bounds>;

const CONTEMPORARY_YEAR = 2024;
const datasetCache = new Map<string, Promise<FeatureCollection>>();

export async function map(input: MapOptions) {
  const options = mapOptionsSchema.parse(input);
  const data = await getGiscoCountries(options.fidelity);
  const features = selectFeatures(data.features, options.target);

  if (features.length === 0) {
    throw new Error(
      `No GISCO countries matched target: ${formatTarget(options.target)}`,
    );
  }

  return renderSvg(features, options.target, options.fidelity);
}

function selectFeatures(features: CountryFeature[], target: MapTarget) {
  if (target.type === "region") {
    return features;
  }

  const wantedCountries = getTargetCountrySelectors(target);
  return features.filter((feature) => countryMatches(feature, wantedCountries));
}

function getTargetCountrySelectors(
  target: Extract<MapTarget, { type: "countries" }>,
) {
  return new Set(target.countries.map(normalizeSelector));
}

function countryMatches(feature: CountryFeature, wantedCountries: Set<string>) {
  return getCountrySelectors(feature).some((value) =>
    wantedCountries.has(normalizeSelector(value))
  );
}

function getCountrySelectors(feature: CountryFeature) {
  return [
    feature.properties.CNTR_ID,
    feature.properties.ISO3_CODE,
    feature.properties.COUNTRY_URI,
    feature.properties.CNTR_NAME,
    feature.properties.NAME_ENGL,
  ].filter((value): value is string => Boolean(value));
}

function formatTarget(target: MapTarget) {
  switch (target.type) {
    case "countries":
      return target.countries.join(", ");
    case "region":
      return target.region;
  }
}

function getGiscoCountries(fidelity: MapOptions["fidelity"]) {
  const cacheKey = fidelity;
  const cached = datasetCache.get(cacheKey);
  if (cached) return cached;

  const resolution = GISCO_RESOLUTION[fidelity];
  const url =
    `https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_${resolution}_${CONTEMPORARY_YEAR}_4326.geojson`;

  const request = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch GISCO map data (${response.status})`);
    }

    return await response.json() as FeatureCollection;
  });

  datasetCache.set(cacheKey, request);
  return request;
}

function renderSvg(features: CountryFeature[], target: MapTarget, fidelity: "low" | "medium" | "high") {
  const width = 800;
  const height = 450;
  const padding = 16;
  const bounds = getViewBounds(features, target);
  const cropBounds = target.type === "region" && target.region !== "world"
    ? bounds
    : undefined;
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 1);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1);
  const scale = Math.min(
    (width - padding * 2) / lonSpan,
    (height - padding * 2) / latSpan,
  );
  const xOffset = (width - lonSpan * scale) / 2;
  const yOffset = (height - latSpan * scale) / 2;

  const project = ([lon, lat]: Position) => {
    const x = xOffset + (lon - bounds.minLon) * scale;
    const y = yOffset + (bounds.maxLat - lat) * scale;
    return `${round(x, fidelity)} ${round(y, fidelity)}`;
  };

  const paths = features.flatMap((feature) => {
    const polygons = getRenderablePolygons(feature, cropBounds);
    const d = polygons.flatMap((polygon) =>
      polygon.map((ring) => `M${ring.map(project).join("L")}Z`)
    ).join("");

    if (d.length === 0) return [];

    return `<path d="${d}" fill="#000000" stroke="#ffffff" stroke-width="1"><title>${
      escapeXml(
        feature.properties.NAME_ENGL ?? feature.properties.CNTR_NAME ?? "",
      )
    }</title></path>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" overflow="hidden" role="img">${paths}</svg>`;
}

function getRenderablePolygons(
  feature: CountryFeature,
  cropBounds: Bounds | undefined,
) {
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Polygon]
    : feature.geometry.coordinates as MultiPolygon;

  if (cropBounds === undefined) {
    return polygons;
  }

  return polygons.map((polygon) =>
    polygon.map((ring) => clipRingToBounds(ring, cropBounds))
      .filter((ring) => ring.length >= 4)
  ).filter((polygon) => polygon.length > 0);
}

function clipRingToBounds(ring: Position[], bounds: Bounds) {
  const clipped = (["left", "right", "bottom", "top"] as const).reduce(
    (currentRing, edge) => clipRingToEdge(currentRing, bounds, edge),
    ring,
  );

  return closeRing(clipped);
}

function clipRingToEdge(
  ring: Position[],
  bounds: Bounds,
  edge: "left" | "right" | "bottom" | "top",
) {
  if (ring.length === 0) return ring;

  const clipped: Position[] = [];

  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentInside = isInsideBoundsEdge(current, bounds, edge);
    const previousInside = isInsideBoundsEdge(previous, bounds, edge);

    if (currentInside) {
      if (!previousInside) {
        clipped.push(intersectBoundsEdge(previous, current, bounds, edge));
      }
      clipped.push(current);
    } else if (previousInside) {
      clipped.push(intersectBoundsEdge(previous, current, bounds, edge));
    }
  }

  return clipped;
}

function isInsideBoundsEdge(
  [lon, lat]: Position,
  bounds: Bounds,
  edge: "left" | "right" | "bottom" | "top",
) {
  switch (edge) {
    case "left":
      return lon >= bounds.minLon;
    case "right":
      return lon <= bounds.maxLon;
    case "bottom":
      return lat >= bounds.minLat;
    case "top":
      return lat <= bounds.maxLat;
  }
}

function intersectBoundsEdge(
  [startLon, startLat]: Position,
  [endLon, endLat]: Position,
  bounds: Bounds,
  edge: "left" | "right" | "bottom" | "top",
): Position {
  if (edge === "left" || edge === "right") {
    const lon = edge === "left" ? bounds.minLon : bounds.maxLon;
    const ratio = (lon - startLon) / (endLon - startLon);
    return [lon, startLat + (endLat - startLat) * ratio];
  }

  const lat = edge === "bottom" ? bounds.minLat : bounds.maxLat;
  const ratio = (lat - startLat) / (endLat - startLat);
  return [startLon + (endLon - startLon) * ratio, lat];
}

function closeRing(ring: Position[]) {
  if (ring.length === 0) return ring;

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;

  return [...ring, first];
}

function getViewBounds(features: CountryFeature[], target: MapTarget): Bounds {
  if (target.type === "region" && target.region !== "world") {
    return REGION_VIEW_BOUNDS[target.region];
  }

  return getFeatureBounds(features);
}

function getFeatureBounds(features: CountryFeature[]) {
  const bounds = {
    minLon: Infinity,
    minLat: Infinity,
    maxLon: -Infinity,
    maxLat: -Infinity,
  };

  for (const feature of features) {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as Polygon]
      : feature.geometry.coordinates as MultiPolygon;

    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          bounds.minLon = Math.min(bounds.minLon, lon);
          bounds.minLat = Math.min(bounds.minLat, lat);
          bounds.maxLon = Math.max(bounds.maxLon, lon);
          bounds.maxLat = Math.max(bounds.maxLat, lat);
        }
      }
    }
  }

  return bounds;
}

function round(value: number, fidelity: "low" | "medium" | "high") {
  return Number(value.toFixed(fidelity === "low" ? 1 : 2));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeSelector(value: string) {
  return value.trim().toLowerCase();
}
