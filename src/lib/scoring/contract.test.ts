import { describe, expect, it } from "vitest";
import type { ContactScoringResult } from "@/lib/scoring/types";
import { SCORE_LABELS } from "@/lib/scoring/types";

describe("ContactScoringResult contract", () => {
  it("defines the future AI scoring interface shape", () => {
    const sample: ContactScoringResult = {
      overallScore: 0,
      icpScore: 0,
      personaScore: 0,
      companyScore: 0,
      productRelevanceScore: 0,
      scoreLabel: "FAIR",
      companySummary: null,
      whatTheySell: null,
      estimatedAov: null,
      aovReasoning: null,
      fitStrengths: [],
      fitRisks: [],
      disqualifiers: [],
      reasoning: "",
      recommendedAction: "",
      researchSources: [],
    };

    expect(SCORE_LABELS).toContain(sample.scoreLabel);
    expect(sample.estimatedAov).toBeNull();
  });
});
