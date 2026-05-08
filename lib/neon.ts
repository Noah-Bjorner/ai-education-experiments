import "@std/dotenv/load";
import { neon } from "@neondatabase/serverless";

const dbUrl = Deno.env.get('NEON_DB');
if (!dbUrl) {
    throw new Error('NEON_DB environment variable is required');
}
export const sql = neon(dbUrl);
