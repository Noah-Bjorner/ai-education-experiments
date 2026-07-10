import { sql } from "../../../lib/neon.ts";

export async function createUser(
  name: string,
  email: string,
): Promise<number> {
  const rows = await sql`
    INSERT INTO users (name, email)
    VALUES (${name}, ${email})
    RETURNING id
  `;
  return Number(rows[0].id);
}