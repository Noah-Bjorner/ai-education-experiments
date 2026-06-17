import { z } from "@zod";

const flagOptionsSchema = z.object({
    countryCode: z.string().trim().min(1).describe(
        "ISO 3166-1 alpha-2 code for the country, for example 'SE' or 'US'.",
    ),
});

export type FlagOptions = z.infer<typeof flagOptionsSchema>;

export async function flag(options: FlagOptions): Promise<string | null> {
    const { countryCode } = flagOptionsSchema.parse(options);
    try {
        const response = await fetch(`https://borderly.dev/flag/${countryCode}.svg`);
        if (!response.ok) {
            return null;
        }
        return await response.text();
    } catch {
        return null;
    }
}