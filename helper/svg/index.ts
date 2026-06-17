import { flag } from "./flag.ts";
import { map, mapOptionsSchema, regionSchema } from "./country-map.ts";

//example: map?countries=us,ca&fidelity=high

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