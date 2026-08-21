import { describe, expect, it } from "vitest";
import { aiScoringAssessmentSchema } from "@/lib/scoring/assessment";

describe("AI scoring assessment validation", () => {
  it("accepts a valid structured assessment", () => {
    const parsed = aiScoringAssessmentSchema.safeParse({
      dimensions: [
        {
          dimension: "Industry Fit",
          component: "ICP",
          assessment: "STRONG",
          evidence: ["Matches SaaS"],
          concerns: [],
          confidence: "HIGH",
        },
      ],
      fitStrengths: ["Clear industry match"],
      fitRisks: [],
      potentialDisqualifiers: [],
      recommendedAction: "Strong target — include in campaign.",
      reasoning: "Industry aligns with ICP.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed output", () => {
    const parsed = aiScoringAssessmentSchema.safeParse({
      dimensions: [
        {
          dimension: "Industry Fit",
          component: "ICP",
          assessment: "AMAZING",
          evidence: "not-an-array",
          concerns: [],
          confidence: "HIGH",
        },
      ],
      fitStrengths: [],
      fitRisks: [],
      potentialDisqualifiers: [],
      recommendedAction: "",
      reasoning: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unexpected numeric score-only payloads as assessment", () => {
    const parsed = aiScoringAssessmentSchema.safeParse({
      overallScore: 88,
      icpScore: 90,
    });
    expect(parsed.success).toBe(false);
  });
});
