const exampleURL =
  "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_2000.geojson";

export type Position = [longitude: number, latitude: number];
export type LinearRing = Position[];
export type PolygonCoordinates = LinearRing[];
export type MultiPolygonCoordinates = PolygonCoordinates[];

export interface Polygon {
  type: "Polygon";
  coordinates: PolygonCoordinates;
}

export interface MultiPolygon {
  type: "MultiPolygon";
  coordinates: MultiPolygonCoordinates;
}

export type Geometry = Polygon | MultiPolygon;

export interface Crs {
  type: "name";
  properties: {
    name: string;
  };
}

export interface FeatureProperties {
  NAME: string | null;
  ABBREVN: string | null;
  SUBJECTO: string | null;
  PARTOF: string | null;
  BORDERPRECISION: 1 | 2 | 3;
  INFO_UR?: string | null;
}

export interface Feature {
  type: "Feature";
  properties: FeatureProperties;
  geometry: Geometry;
}

export interface GeoJSON {
  type: "FeatureCollection";
  name?: string;
  crs?: Crs;
  features: Feature[];
}

export interface HistoricalBasemapOptions {
  countries: string[];
}

export async function getHistoricalBasemaps(
  options: HistoricalBasemapOptions,
): Promise<GeoJSON> {
  const wantedCountries = new Set(
    options.countries.map(normalizeSelector),
  );
  const response = await fetch(exampleURL);
  if (!response.ok) {
    throw new Error(`Failed to fetch historical basemaps (${response.status})`);
  }

  const data = await response.json() as GeoJSON;
  return {
    ...data,
    features: data.features.filter((feature) =>
      countryMatches(feature, wantedCountries)
    ),
  };
}

function countryMatches(feature: Feature, wantedCountries: Set<string>) {
  return getCountrySelectors(feature).some((value) =>
    wantedCountries.has(normalizeSelector(value))
  );
}

function getCountrySelectors(feature: Feature) {
  return [
    feature.properties.NAME,
    feature.properties.ABBREVN,
  ].filter((value): value is string => Boolean(value));
}

function normalizeSelector(value: string) {
  return value.trim().toLowerCase();
}


if (import.meta.main) {
    const start = performance.now();
    const data = await getHistoricalBasemaps({
        countries: ["Sweden", "Norway", "Denmark"],
    }); 
    console.log(JSON.stringify(data, null, 2));
    const end = performance.now();  
    console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
  }
  