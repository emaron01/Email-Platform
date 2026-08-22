/**
 * Product / persona synthesis contract coercion tests.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_AI_MALFORMED_FIXTURE,
  parseProductAiResponse,
  productAiResponseSchema,
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
} from "@/lib/product-research/contract";
import { parsePersonaAiResponse } from "@/lib/persona-research/contract";

describe("parseProductAiResponse coercion", () => {
  it('normalizes confidence "high" / "Medium" / "MEDIUM "', () => {
    const { data, coercedFields } = parseProductAiResponse({
      productDraft: {},
      productMessagingDraft: {},
      suggestedBuyerRoles: [
        { name: "A", confidence: "high" },
        { name: "B", confidence: "Medium" },
        { name: "C", confidence: "MEDIUM " },
      ],
    });
    expect(data.suggestedBuyerRoles[0]!.confidence).toBe("HIGH");
    expect(data.suggestedBuyerRoles[1]!.confidence).toBe("MEDIUM");
    expect(data.suggestedBuyerRoles[2]!.confidence).toBe("MEDIUM");
    expect(coercedFields).toContain("confidence");
  });

  it('maps confidence "MEDIUM-HIGH" to MEDIUM and records coercion', () => {
    const { data, coercedFields } = parseProductAiResponse({
      productDraft: {},
      productMessagingDraft: {},
      suggestedBuyerRoles: [{ name: "A", confidence: "MEDIUM-HIGH" }],
    });
    expect(data.suggestedBuyerRoles[0]!.confidence).toBe("MEDIUM");
    expect(coercedFields).toContain("confidence");
  });

  it("coerces evidenceRefs bare strings into objects", () => {
    const { data, coercedFields } = parseProductAiResponse({
      productDraft: {
        evidenceRefs: ["Runs weekly forecast call"],
      },
      productMessagingDraft: {},
      suggestedBuyerRoles: [
        {
          name: "CRO",
          evidenceRefs: ["Owns revenue forecasting"],
        },
      ],
    });
    expect(data.productDraft.evidenceRefs[0]).toEqual({
      claim: "Runs weekly forecast call",
      sourceIds: [],
      note: null,
    });
    expect(data.suggestedBuyerRoles[0]!.evidenceRefs[0]).toEqual({
      claim: "Owns revenue forecasting",
      sourceIds: [],
      note: null,
    });
    expect(coercedFields).toContain("evidenceRefs");
  });

  it("drops evidenceRefs entries with no claim instead of failing", () => {
    const { data } = parseProductAiResponse({
      productDraft: {
        evidenceRefs: [{ sourceIds: ["s1"] }, { claim: "Valid claim" }],
      },
      productMessagingDraft: {},
      suggestedBuyerRoles: [{ name: "A" }],
    });
    expect(data.productDraft.evidenceRefs).toHaveLength(1);
    expect(data.productDraft.evidenceRefs[0]!.claim).toBe("Valid claim");
  });

  it("parses when evidenceRefs is missing entirely", () => {
    const { data } = parseProductAiResponse({
      productDraft: { description: "Tool" },
      productMessagingDraft: {},
      suggestedBuyerRoles: [{ name: "CRO" }],
    });
    expect(data.productDraft.evidenceRefs).toEqual([]);
    expect(data.suggestedBuyerRoles[0]!.evidenceRefs).toEqual([]);
  });

  it("parses the production malformed fixture verbatim", () => {
    const { data, coercedFields } = parseProductAiResponse(
      PRODUCT_AI_MALFORMED_FIXTURE,
    );
    expect(data.suggestedBuyerRoles).toHaveLength(4);
    expect(data.suggestedBuyerRoles.every((r) => r.confidence === "HIGH" || r.confidence === "MEDIUM")).toBe(true);
    expect(data.productDraft.evidenceRefs).toEqual([]);
    expect(data.suggestedBuyerRoles[0]!.evidenceRefs).toEqual([]);
    expect(coercedFields).toContain("confidence");
    expect(coercedFields).toContain("evidenceRefs");
    expect(productAiResponseSchema.safeParse(data).success).toBe(true);
  });

  it("uses prompt version 4", () => {
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("4");
  });
});

describe("parsePersonaAiResponse coercion", () => {
  it("normalizes persona draft confidence and evidenceRefs", () => {
    const { data, coercedFields } = parsePersonaAiResponse({
      personaDraft: {
        name: "VP RevOps",
        confidence: "high",
        evidenceRefs: ["Owns CRM hygiene"],
      },
    });
    expect(data.personaDraft.confidence).toBe("HIGH");
    expect(data.personaDraft.evidenceRefs[0]!.claim).toBe("Owns CRM hygiene");
    expect(coercedFields).toContain("confidence");
    expect(coercedFields).toContain("evidenceRefs");
  });
});
