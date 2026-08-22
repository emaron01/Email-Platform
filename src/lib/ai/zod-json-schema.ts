/**
 * Convert Zod schemas to OpenAI strict JSON Schema payloads.
 */

import { z } from "zod";

/** OpenAI strict mode rejects root $schema and requires closed objects. */
export function zodToOpenAiStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  return sanitizeOpenAiStrictJsonSchema(raw);
}

export function buildOpenAiJsonSchemaFormat(
  schemaName: string,
  schema: z.ZodType,
): {
  type: "json_schema";
  name: string;
  schema: Record<string, unknown>;
  strict: true;
} {
  const safeName =
    schemaName.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) ||
    "structured_response";
  return {
    type: "json_schema",
    name: safeName,
    schema: zodToOpenAiStrictJsonSchema(schema),
    strict: true,
  };
}

function sanitizeOpenAiStrictJsonSchema(
  node: Record<string, unknown>,
): Record<string, unknown> {
  const { $schema: _schema, ...rest } = node;
  return walkJsonSchema(rest) as Record<string, unknown>;
}

function walkJsonSchema(node: unknown): unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return node;
  }

  const obj = { ...(node as Record<string, unknown>) };

  if (obj.type === "object" || obj.properties) {
    obj.additionalProperties = false;
    if (obj.properties && typeof obj.properties === "object") {
      const props = obj.properties as Record<string, unknown>;
      obj.properties = Object.fromEntries(
        Object.entries(props).map(([key, value]) => [key, walkJsonSchema(value)]),
      );
      if (!Array.isArray(obj.required)) {
        obj.required = Object.keys(props);
      }
    }
  }

  if (obj.items) {
    obj.items = walkJsonSchema(obj.items);
  }

  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const branch = obj[key];
    if (Array.isArray(branch)) {
      obj[key] = branch.map((entry) => walkJsonSchema(entry));
    }
  }

  const defs = obj.$defs ?? obj.definitions;
  if (defs && typeof defs === "object") {
    const nextDefs = Object.fromEntries(
      Object.entries(defs as Record<string, unknown>).map(([key, value]) => [
        key,
        walkJsonSchema(value),
      ]),
    );
    if (obj.$defs) obj.$defs = nextDefs;
    if (obj.definitions) obj.definitions = nextDefs;
  }

  return obj;
}
