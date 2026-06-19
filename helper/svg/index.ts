import { flag } from "./flag.ts";
import { map, mapOptionsSchema, regionSchema } from "./country-map.ts";

//example: map?countries=us,ca&fidelity=high

export const HOW_TO_USE_SVG_HELPER =
`SVGs are requested with a string of the form "type?key=value&key=value", where the type selects what to render and the keys configure it.

There are two types:

1. flag — a single country flag.
   Example: flag?countryCode=SE
   - countryCode: ISO 3166-1 alpha-2 code, e.g. "SE", "US".

2. map — a geographic map, either highlighting specific countries or framed to a region.
   Example: map?countries=us,ca&fidelity=high
   Example: map?region=nordics&fidelity=low
   - countries: comma-separated selectors, matched by alpha-2, alpha-3, or English name (e.g. "SE", "SWE", "Sweden").
   - region: ${regionSchema.options.join(", ")}.
   - fidelity: ${mapOptionsSchema.shape.fidelity.options.map((f) => `"${f}"`).join(" | ")}, defaults to "low".
   A map uses either countries or region; when both are present countries takes priority.`

export async function svg(params: string): Promise<string | null> {
    const [type, query = ""] = params.split("?");
    if (!type) {
        return null;
    }
    const search = new URLSearchParams(query);
    switch (type) {
        case "flag": {
            const countryCode = search.get("countryCode");
            if (!countryCode) {
                throw new Error("countryCode is required");
            }
            return await flag({ countryCode: countryCode});
        }
        case "map": {
            const countries = search.get("countries")?.split(",").filter(Boolean);
            const fidelity = search.get("fidelity") ?? "low";
            if (countries?.length) {
                return await map(mapOptionsSchema.parse({
                    target: { type: "countries", countries },
                    fidelity,
                }));
            }
            const region = search.get("region");
            if (!region) {
                throw new Error("region is required");
            }
            return await map(mapOptionsSchema.parse({
                target: { type: "region", region: regionSchema.parse(region) },
                fidelity,
            }));
        }
        default:
            return null;
    }
}