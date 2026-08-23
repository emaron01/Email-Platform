import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  assertStrictOpenAiObjectNodes,
  buildOpenAiJsonSchemaFormat,
  collectStrictObjectViolations,
  zodToOpenAiStrictJsonSchema,
} from "@/lib/ai/zod-json-schema";
import { contactResearchAiResultSchema } from "@/lib/contact-research/service";
import {
  icpInterpretationResultSchema,
  interpretationResultSchema,
} from "@/lib/interpretation/schema";
import { personaAiResponseSchema } from "@/lib/persona-research/contract";
import {
  parseProductAiResponse,
  productAiResponseSchema,
} from "@/lib/product-research/contract";
import { companyResearchAiResultSchema } from "@/lib/research/assessment";
import { productSourceDiscoverySchema } from "@/lib/research/web-search-retriever";
import { aiScoringAssessmentSchema } from "@/lib/scoring/assessment";

function expectStrictObjectNodes(schema: unknown): void {
  const violations = collectStrictObjectViolations(schema);
  expect(violations).toEqual([]);
}

function findEvidenceRefItemSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const productDraft = (schema.properties as Record<string, unknown>)
    .productDraft as Record<string, unknown>;
  const evidenceRefs = (productDraft.properties as Record<string, unknown>)
    .evidenceRefs as Record<string, unknown>;
  return evidenceRefs.items as Record<string, unknown>;
}

function schemaHasMinItems(node: unknown): boolean {
  let found = false;
  const walk = (current: unknown): void => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    const obj = current as Record<string, unknown>;
    if ("minItems" in obj || "maxItems" in obj) found = true;
    if (obj.properties) {
      for (const value of Object.values(obj.properties as Record<string, unknown>)) {
        walk(value);
      }
    }
    if (obj.items) walk(obj.items);
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const branch = obj[key];
      if (Array.isArray(branch)) branch.forEach(walk);
    }
    const defs = obj.$defs ?? obj.definitions;
    if (defs && typeof defs === "object") {
      for (const value of Object.values(defs as Record<string, unknown>)) walk(value);
    }
  };
  walk(node);
  return found;
}

function noteSchemaAcceptsNull(noteSchema: Record<string, unknown>): boolean {
  if (noteSchema.type === "null") return true;
  if (Array.isArray(noteSchema.type) && noteSchema.type.includes("null")) return true;
  const branches = noteSchema.anyOf ?? noteSchema.oneOf;
  if (Array.isArray(branches)) {
    return branches.some(
      (branch) =>
        branch &&
        typeof branch === "object" &&
        (branch as Record<string, unknown>).type === "null",
    );
  }
  return false;
}

const GENERATE_STRUCTURED_SCHEMAS: Array<{ name: string; schema: z.ZodType }> = [
  { name: "productAiResponseSchema", schema: productAiResponseSchema },
  { name: "personaAiResponseSchema", schema: personaAiResponseSchema },
  { name: "aiScoringAssessmentSchema", schema: aiScoringAssessmentSchema },
  { name: "interpretationResultSchema", schema: interpretationResultSchema },
  { name: "icpInterpretationResultSchema", schema: icpInterpretationResultSchema },
  { name: "contactResearchAiResultSchema", schema: contactResearchAiResultSchema },
  { name: "companyResearchAiResultSchema", schema: companyResearchAiResultSchema },
  { name: "productSourceDiscoverySchema", schema: productSourceDiscoverySchema },
];

describe("zodToOpenAiStrictJsonSchema", () => {
  it("produces strict closed object schema without root $schema", () => {
    const schema = zodToOpenAiStrictJsonSchema(
      z.object({
        name: z.string(),
        tags: z.array(z.string()).default([]),
        bio: z.string().nullable().optional(),
      }),
    );
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(new Set(schema.required as string[])).toEqual(
      new Set(["name", "tags", "bio"]),
    );
    expectStrictObjectNodes(schema);
  });

  it("buildOpenAiJsonSchemaFormat sets strict true and name", () => {
    const format = buildOpenAiJsonSchemaFormat(
      "product_setup_synthesis",
      productAiResponseSchema,
    );
    expect(format.type).toBe("json_schema");
    expect(format.name).toBe("product_setup_synthesis");
    expect(format.strict).toBe(true);
    expect(format.schema.type).toBe("object");
    expect(format.schema.additionalProperties).toBe(false);
  });

  it.each(GENERATE_STRUCTURED_SCHEMAS)(
    "$name: every object node has full required key set",
    ({ schema }) => {
      const jsonSchema = zodToOpenAiStrictJsonSchema(schema);
      expectStrictObjectNodes(jsonSchema);
      assertStrictOpenAiObjectNodes(jsonSchema, (condition, message) => {
        expect(condition, message).toBe(true);
      });
    },
  );

  it.each(GENERATE_STRUCTURED_SCHEMAS)(
    "$name: no array carries minItems",
    ({ schema }) => {
      expect(schemaHasMinItems(zodToOpenAiStrictJsonSchema(schema))).toBe(false);
    },
  );

  it("evidenceRefs items emit note as required with a null-permitting type", () => {
    const schema = zodToOpenAiStrictJsonSchema(productAiResponseSchema);
    const itemSchema = findEvidenceRefItemSchema(schema);
    const required = itemSchema.required as string[];
    const noteSchema = (itemSchema.properties as Record<string, unknown>)
      .note as Record<string, unknown>;

    expect(required).toContain("note");
    expect(noteSchemaAcceptsNull(noteSchema)).toBe(true);
  });

  it("maps z.unknown() optional fields to a JSON value union", () => {
    const schema = zodToOpenAiStrictJsonSchema(
      z.object({ targetValue: z.unknown().optional() }),
    );
    const targetValue = (schema.properties as Record<string, unknown>)
      .targetValue as Record<string, unknown>;
    expect(targetValue.anyOf).toBeDefined();
    expect(noteSchemaAcceptsNull(targetValue)).toBe(true);
    expectStrictObjectNodes(schema);
  });
});

describe("parseProductAiResponse note handling", () => {
  const base = {
    productDraft: {},
    productMessagingDraft: {},
    suggestedBuyerRoles: [{ name: "CRO" }],
  };

  it("parses when note is explicitly null", () => {
    const { data } = parseProductAiResponse({
      ...base,
      productDraft: {
        evidenceRefs: [{ claim: "Runs forecast call", sourceIds: [], note: null }],
      },
    });
    expect(data.productDraft.evidenceRefs[0]!.note).toBeNull();
  });

  it("parses when note is absent", () => {
    const { data } = parseProductAiResponse({
      ...base,
      productDraft: {
        evidenceRefs: [{ claim: "Runs forecast call", sourceIds: [] }],
      },
    });
    expect(data.productDraft.evidenceRefs[0]!.note).toBeNull();
  });

  it("parses when array fields are explicitly null under strict output", () => {
    const { data } = parseProductAiResponse({
      productDraft: {
        description: null,
        problemsSolved: null,
        evidenceRefs: null,
      },
      productMessagingDraft: { coreValueThemes: null },
      suggestedBuyerRoles: null,
    });
    expect(data.productDraft.problemsSolved).toEqual([]);
    expect(data.productDraft.evidenceRefs).toEqual([]);
    expect(data.suggestedBuyerRoles).toEqual([]);
  });
});

describe("openai-responses strict request body", () => {
  it("includes json_schema format with strict enforcement", async () => {
    process.env.PRODUCT_AI_PROVIDER = "openai-responses";
    process.env.PRODUCT_AI_MODEL = "gpt-5.6-luna";
    process.env.PRODUCT_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.PRODUCT_AI_API_KEY = "sk-test";

    const { getProductAiConfig } = await import("@/lib/ai/config");
    const { createOpenAiResponsesProvider } = await import(
      "@/lib/ai/providers/openai-responses"
    );

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  productDraft: {},
                  productMessagingDraft: {},
                  suggestedBuyerRoles: [],
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiResponsesProvider(getProductAiConfig());
    await provider.generateStructured({
      messages: [{ role: "user", content: "x" }],
      schema: productAiResponseSchema,
      schemaName: "product_setup_synthesis",
      parseOutput: parseProductAiResponse,
    });

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]![1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.name).toBe("product_setup_synthesis");
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expectStrictObjectNodes(body.text.format.schema);
    expect(body.text.format.type).not.toBe("json_object");
    vi.unstubAllGlobals();
  });
});
