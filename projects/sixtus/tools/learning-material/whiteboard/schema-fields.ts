import { z } from "@zod";

type JsonSchema = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  minItems?: number;
  maxItems?: number;
};

function alternatives(schema: JsonSchema): JsonSchema[] | undefined {
  return schema.anyOf ?? schema.oneOf;
}

function isScalar(schema: JsonSchema): boolean {
  if (schema.const !== undefined || schema.enum) return true;
  const types = schema.type === undefined
    ? []
    : Array.isArray(schema.type)
    ? schema.type
    : [schema.type];
  if (
    types.length > 0 &&
    types.every((type) =>
      ["string", "number", "integer", "boolean", "null"].includes(type)
    )
  ) {
    return true;
  }
  const alts = alternatives(schema);
  return !!alts && alts.every(isScalar);
}

function range(min?: number, max?: number): string {
  if (min === undefined && max === undefined) return "";
  if (min !== undefined && max !== undefined) return ` (${min}–${max})`;
  if (min !== undefined) return ` (${min}+)`;
  return ` (≤${max})`;
}

function schemaType(schema: JsonSchema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  const alts = alternatives(schema);
  if (alts && alts.every(isScalar)) {
    return alts.map(schemaType).join(" | ");
  }
  if (schema.type === "array") {
    const items = schema.items;
    const bounds = range(schema.minItems, schema.maxItems);
    if (
      !items || items.properties || alternatives(items)?.some((item) =>
        item.properties
      )
    ) {
      return `array${bounds}`;
    }
    return `array of ${schemaType(items)}${bounds}`;
  }
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type) return schema.type;
  if (schema.properties) return "object";
  if (alts) return "object";
  return "unknown";
}

function formatProperties(
  schema: JsonSchema,
  depth: number,
): string[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([name, field]) =>
    formatField(name, field, required.has(name), depth)
  );
}

function formatField(
  name: string,
  schema: JsonSchema,
  required: boolean,
  depth: number,
): string[] {
  const indent = "  ".repeat(depth);
  const optional = required ? "" : "?";
  const description = schema.description && (depth === 0 || name !== "id")
    ? ` — ${schema.description}`
    : "";
  const lines = [
    `${indent}- \`${name}${optional}\`: ${schemaType(schema)}${description}`,
  ];
  if (name === "annotations") return lines;

  if (schema.properties) {
    lines.push(...formatProperties(schema, depth + 1));
  }

  const items = schema.type === "array" ? schema.items : undefined;
  if (!items) return lines;

  const variants = alternatives(items)?.filter((item) => item.properties);
  if (variants && variants.length > 0) {
    lines.push(`${indent}  - one of:`);
    for (const variant of variants) {
      const kind = variant.properties?.kind?.const ??
        variant.properties?.type?.const;
      const label = kind !== undefined ? JSON.stringify(kind) : "object";
      lines.push(`${indent}    - ${label}`);
      lines.push(...formatProperties(variant, depth + 3));
    }
    return lines;
  }
  if (items.properties) {
    lines.push(...formatProperties(items, depth + 1));
  }
  return lines;
}

/** Compact field list from a Zod object schema, with descriptions when present. */
export function formatFigureSchemaFields(schema: z.ZodType): string {
  const json = z.toJSONSchema(schema) as JsonSchema;
  return formatProperties(json, 0).join("\n");
}
