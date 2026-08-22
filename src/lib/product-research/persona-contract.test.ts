/**
 * Legacy persona-contract tests redirected to Product v3 buyer roles.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productAiResponseSchema,
  productSynthesisResultSchema,
} from "@/lib/product-research/contract";
import {
  assignSuggestionKeys,
  transformProductAiResponse,
} from "@/lib/product-research/transform";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";

describe("Product AI buyer-role contract (v3)", () => {
  it("does not require suggestionKey from AI", () => {
    const parsed = productAiResponseSchema.parse({
      productDraft: { description: "Forecast tool" },
      productMessagingDraft: { primaryPositioning: "Confidence" },
      suggestedBuyerRoles: [
        {
          name: "Chief Revenue Officer",
          likelyTitles: ["CRO"],
          whyThisRoleMatters: "Owns forecast outcomes",
          confidence: "HIGH",
        },
      ],
    });
    expect(parsed.suggestedBuyerRoles[0]!.name).toBe("Chief Revenue Officer");
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("4");
  });

  it("requires non-empty buyer role name", () => {
    expect(() =>
      productAiResponseSchema.parse({
        productDraft: {},
        productMessagingDraft: {},
        suggestedBuyerRoles: [{ name: "   " }],
      }),
    ).toThrow();
  });

  it("app generates unique suggestionKeys for buyer roles", () => {
    const ai = productAiResponseSchema.parse({
      productDraft: {},
      productMessagingDraft: {},
      suggestedBuyerRoles: [
        { name: "Sales Leadership" },
        { name: "Sales Leadership" },
      ],
    });
    const result = transformProductAiResponse(ai);
    expect(result.suggestedBuyerRoles).toHaveLength(2);
    expect(result.suggestedBuyerRoles[0]!.suggestionKey).not.toBe(
      result.suggestedBuyerRoles[1]!.suggestionKey,
    );
    expect(productSynthesisResultSchema.parse(result)).toBeTruthy();
  });

  it("assignSuggestionKeys is collision-safe", () => {
    const keys = assignSuggestionKeys(["CRO", "CRO"]);
    expect(new Set(keys).size).toBe(2);
  });

  it("prompt asks for suggestedBuyerRoles only", () => {
    const messages = buildProductSynthesisMessages({
      productName: "Forecast App",
      primaryUrl: null,
      excerpts: [
        {
          sourceId: "s1",
          sourceType: "USER_NOTE",
          displayName: "Notes",
          text: "Helps CROs forecast.",
        },
      ],
    });
    expect(messages[0]!.content).toContain("suggestedBuyerRoles");
    expect(messages[0]!.content).toContain("Do NOT return suggestionKey");
  });
});
