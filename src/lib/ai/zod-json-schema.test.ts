import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  buildOpenAiJsonSchemaFormat,
  zodToOpenAiStrictJsonSchema,
} from "@/lib/ai/zod-json-schema";
import { productAiResponseSchema } from "@/lib/product-research/contract";

describe("zodToOpenAiStrictJsonSchema", () => {
  it("produces strict closed object schema without root $schema", () => {
    const schema = zodToOpenAiStrictJsonSchema(
      z.object({
        name: z.string(),
        tags: z.array(z.string()).default([]),
      }),
    );
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["name", "tags"]);
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
    const { parseProductAiResponse, productAiResponseSchema } = await import(
      "@/lib/product-research/contract"
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
    expect(body.text.format.type).not.toBe("json_object");
    vi.unstubAllGlobals();
  });
});
