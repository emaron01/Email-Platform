/**
 * Canonical persona AI contract → app suggestionKey + dual UI structures.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productAiResponseSchema,
  productSynthesisResultSchema,
} from "@/lib/product-research/contract";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";
import {
  assignSuggestionKeys,
  transformProductAiResponse,
} from "@/lib/product-research/transform";

describe("Product AI persona contract (canonical personas[])", () => {
  it("does not require suggestionKey from AI", () => {
    const parsed = productAiResponseSchema.parse({
      productDraft: { description: "Forecast tool" },
      productMessagingDraft: { primaryPositioning: "Confidence" },
      personas: [
        {
          name: "Chief Revenue Officer",
          likelyTitles: ["CRO", "Chief Revenue Officer"],
          function: "Sales",
          seniority: "C-Suite",
          whyThisPersonaMatters: "Owns forecast outcomes",
          responsibilities: ["Owns revenue forecast"],
          desiredOutcomesFromSolution: ["Reduce forecast admin"],
          confidence: "HIGH",
        },
      ],
    });
    expect(parsed.personas[0]!.name).toBe("Chief Revenue Officer");
    expect(parsed.personas[0]).not.toHaveProperty("suggestionKey");
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("2");
  });

  it("requires non-empty trimmed persona name", () => {
    expect(() =>
      productAiResponseSchema.parse({
        productDraft: {},
        productMessagingDraft: {},
        personas: [{ name: "   " }],
      }),
    ).toThrow();
    expect(() =>
      productAiResponseSchema.parse({
        productDraft: {},
        productMessagingDraft: {},
        personas: [{ name: null }],
      }),
    ).toThrow();
    expect(() =>
      productAiResponseSchema.parse({
        productDraft: {},
        productMessagingDraft: {},
        personas: [{}],
      }),
    ).toThrow();
  });

  it("app generates unique suggestionKeys linking card and draft", () => {
    const ai = productAiResponseSchema.parse({
      productDraft: {},
      productMessagingDraft: {},
      personas: [
        { name: "Sales Leadership" },
        { name: "Sales Leadership" },
        { name: "Revenue Operations Leader" },
      ],
    });
    const result = transformProductAiResponse(ai);
    expect(result.suggestedPersonas).toHaveLength(3);
    expect(result.personaDrafts).toHaveLength(3);

    const keys = result.suggestedPersonas.map((s) => s.suggestionKey);
    expect(new Set(keys).size).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(result.suggestedPersonas[i]!.suggestionKey).toBe(
        result.personaDrafts[i]!.suggestionKey,
      );
      expect(result.suggestedPersonas[i]!.name).toBe(result.personaDrafts[i]!.name);
    }
    expect(productSynthesisResultSchema.parse(result).suggestedPersonas[0]!.suggestionKey).toBeTruthy();
  });

  it("canonical persona derives both card and draft without AI dual arrays", () => {
    const ai = productAiResponseSchema.parse({
      productDraft: { description: "X" },
      productMessagingDraft: {},
      personas: [
        {
          name: "IT Infrastructure Leader",
          function: "IT",
          responsibilities: ["Owns infra"],
          ownershipAreas: ["Cloud"],
          painPoints: ["Manual ops"],
          desiredOutcomesFromYourSolution: ["Automate ops"],
          positiveRoleSignals: ["Owns infrastructure"],
          negativeRoleSignals: ["Pure IC engineer"],
          messagingNotes: "Lead with reliability",
          confidence: "MEDIUM",
        },
      ],
    });
    const result = transformProductAiResponse(ai);
    expect(result.suggestedPersonas[0]!.department).toBe("IT");
    expect(result.personaDrafts[0]!.responsibilities).toEqual(["Owns infra"]);
    expect(result.personaDrafts[0]!.desiredOutcomesFromYourSolution).toEqual([
      "Automate ops",
    ]);
    expect(result.personaDrafts[0]!.positiveRoleSignals).toEqual([
      "Owns infrastructure",
    ]);
    // AI contract has only personas[] — not parallel suggestedPersonas/personaDrafts
    expect(Object.keys(ai)).toEqual(
      expect.arrayContaining([
        "productDraft",
        "productMessagingDraft",
        "personas",
      ]),
    );
    expect(ai).not.toHaveProperty("suggestedPersonas");
    expect(ai).not.toHaveProperty("personaDrafts");
  });

  it("assignSuggestionKeys is collision-safe for duplicate names", () => {
    const keys = assignSuggestionKeys(["CRO", "CRO", "cro"]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(new Set(keys).size).toBe(3);
  });

  it("prompt asks for personas[] and forbids suggestionKey / dual arrays", () => {
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
    const system = messages[0]!.content;
    expect(system).toContain("personas");
    expect(system).toContain("Do NOT return suggestionKey");
    expect(system).toContain("Do NOT return separate suggestedPersonas");
    expect(system).toContain("Every persona.name must be a non-empty string");
  });

  it("retry synthesis path still reuses bundle only", async () => {
    const fs = await import("node:fs");
    const synth = fs.readFileSync("src/lib/product-research/synthesize.ts", "utf8");
    expect(synth).toContain("productAiResponseSchema");
    expect(synth).toContain("transformProductAiResponse");
    expect(synth).toContain("resynthesizeFromBundle");
    expect(synth).not.toContain("acquireProductEvidence");
    expect(synth).not.toContain("runProgressiveProductWebSearch");
  });
});
