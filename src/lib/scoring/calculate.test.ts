import { describe, expect, it } from "vitest";
import {
  assessmentToNumeric,
  assignScoreLabel,
  calculateComponentScores,
  calculateScoresFromAssessment,
} from "@/lib/scoring/calculate";
import { COMPONENT_WEIGHTS } from "@/lib/scoring/config";
import type { AiScoringAssessment } from "@/lib/scoring/assessment";
import type { ApplicableDimension } from "@/lib/scoring/dimensions";
import type { IcpSnapshot } from "@/lib/scoring/types";

describe("deterministic scoring mappings", () => {
  it("maps STRONG/MODERATE/WEAK/NO_FIT/UNKNOWN correctly", () => {
    expect(assessmentToNumeric("STRONG", "HIGH")).toBe(100);
    expect(assessmentToNumeric("MODERATE", "HIGH")).toBe(70);
    expect(assessmentToNumeric("WEAK", "HIGH")).toBe(35);
    expect(assessmentToNumeric("NO_FIT", "HIGH")).toBe(0);
    expect(assessmentToNumeric("UNKNOWN", "HIGH")).toBe(50);
  });

  it("applies confidence modifiers", () => {
    expect(assessmentToNumeric("STRONG", "HIGH")).toBe(100);
    expect(assessmentToNumeric("STRONG", "MEDIUM")).toBe(85);
    expect(assessmentToNumeric("STRONG", "LOW")).toBe(70);
  });

  it("applies overall weighting", () => {
    const scores = calculateComponentScores([
      {
        dimension: "Industry Fit",
        component: "ICP",
        assessment: "STRONG",
        evidence: [],
        concerns: [],
        confidence: "HIGH",
      },
      {
        dimension: "Title Match",
        component: "PERSONA",
        assessment: "STRONG",
        evidence: [],
        concerns: [],
        confidence: "HIGH",
      },
      {
        dimension: "Buying Signals",
        component: "COMPANY",
        assessment: "STRONG",
        evidence: [],
        concerns: [],
        confidence: "HIGH",
      },
      {
        dimension: "Value Proposition Relevance",
        component: "PRODUCT",
        assessment: "STRONG",
        evidence: [],
        concerns: [],
        confidence: "HIGH",
      },
    ]);

    expect(scores.icpScore).toBe(100);
    expect(scores.personaScore).toBe(100);
    expect(scores.companyScore).toBe(100);
    expect(scores.productRelevanceScore).toBe(100);
    expect(scores.overallScore).toBe(100);
    expect(COMPONENT_WEIGHTS.icp).toBe(0.4);
    expect(COMPONENT_WEIGHTS.persona).toBe(0.3);
    expect(COMPONENT_WEIGHTS.company).toBe(0.15);
    expect(COMPONENT_WEIGHTS.productRelevance).toBe(0.15);
  });

  it("assigns score labels from thresholds", () => {
    expect(assignScoreLabel(95, false)).toBe("EXCELLENT");
    expect(assignScoreLabel(80, false)).toBe("GOOD");
    expect(assignScoreLabel(65, false)).toBe("FAIR");
    expect(assignScoreLabel(40, false)).toBe("POOR");
    expect(assignScoreLabel(95, true)).toBe("DISQUALIFIED");
  });

  it("tracks UNKNOWN separately", () => {
    const scores = calculateComponentScores([
      {
        dimension: "Industry Fit",
        component: "ICP",
        assessment: "UNKNOWN",
        evidence: [],
        concerns: [],
        confidence: "LOW",
      },
    ]);
    expect(scores.unknownDimensionCount).toBe(1);
  });
});

describe("assessment → calculated score", () => {
  const icp: IcpSnapshot = {
    id: "icp1",
    name: "ICP",
    description: null,
    definition: null,
    targetIndustries: ["SaaS"],
    minEmployees: 50,
    maxEmployees: 250,
    minRevenue: null,
    maxRevenue: null,
    targetGeographies: null,
    requiredTechnologies: null,
    positiveSignals: null,
    negativeSignals: ["Uses competitor X exclusively"],
    notes: null,
    criteria: [],
  };

  const applicable: ApplicableDimension[] = [
    { component: "ICP", dimension: "Industry Fit" },
    { component: "ICP", dimension: "Employee Size Fit" },
    { component: "ICP", dimension: "Negative / Disqualifying Signals" },
  ];

  it("accepts explicit evidence-backed disqualifiers", () => {
    const assessment: AiScoringAssessment = {
      dimensions: [
        {
          dimension: "Industry Fit",
          component: "ICP",
          assessment: "STRONG",
          evidence: ["SaaS industry"],
          concerns: [],
          confidence: "HIGH",
        },
        {
          dimension: "Employee Size Fit",
          component: "ICP",
          assessment: "MODERATE",
          evidence: ["180 employees"],
          concerns: [],
          confidence: "HIGH",
        },
        {
          dimension: "Negative / Disqualifying Signals",
          component: "ICP",
          assessment: "NO_FIT",
          evidence: ["Exclusive competitor X deployment"],
          concerns: [],
          confidence: "HIGH",
        },
      ],
      fitStrengths: ["Industry matches ICP"],
      fitRisks: ["Competitor lock-in"],
      potentialDisqualifiers: [
        {
          criterion: "Uses competitor X exclusively",
          evidence: ["Company research notes exclusive Competitor X stack"],
          confidence: "HIGH",
        },
      ],
      recommendedAction: "Exclude from campaign.",
      reasoning: "Matches explicit ICP disqualifier.",
    };

    const result = calculateScoresFromAssessment({
      assessment,
      applicable,
      icp,
    });
    expect(result.scoreLabel).toBe("DISQUALIFIED");
    expect(result.disqualifiers).toHaveLength(1);
  });

  it("rejects speculative disqualifiers", () => {
    const assessment: AiScoringAssessment = {
      dimensions: [
        {
          dimension: "Industry Fit",
          component: "ICP",
          assessment: "STRONG",
          evidence: ["SaaS"],
          concerns: [],
          confidence: "HIGH",
        },
      ],
      fitStrengths: [],
      fitRisks: [],
      potentialDisqualifiers: [
        {
          criterion: "Maybe not a good culture fit",
          evidence: ["Gut feeling"],
          confidence: "LOW",
        },
      ],
      recommendedAction: "Include",
      reasoning: "Strong industry fit",
    };

    const result = calculateScoresFromAssessment({
      assessment,
      applicable: [{ component: "ICP", dimension: "Industry Fit" }],
      icp,
    });
    expect(result.scoreLabel).not.toBe("DISQUALIFIED");
    expect(result.disqualifiers).toHaveLength(0);
  });
});
