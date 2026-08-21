import {
  ASSESSMENT_SCORE_MAP,
  COMPONENT_WEIGHTS,
  CONFIDENCE_MODIFIER,
  SCORE_LABEL_THRESHOLDS,
  type AssessmentValue,
  type ConfidenceValue,
} from "@/lib/scoring/config";
import type {
  AiScoringAssessment,
  DimensionAssessment,
} from "@/lib/scoring/assessment";
import type { ApplicableDimension } from "@/lib/scoring/dimensions";
import type { ScoreLabelValue } from "@/lib/scoring/types";
import {
  resolveDisqualifiers,
  type ResolvedDisqualifier,
} from "@/lib/scoring/disqualify";
import type { IcpSnapshot } from "@/lib/scoring/types";

export type ComponentScores = {
  icpScore: number;
  personaScore: number;
  companyScore: number;
  productRelevanceScore: number;
  overallScore: number;
  unknownDimensionCount: number;
  scoredDimensionCount: number;
};

export function assessmentToNumeric(
  assessment: AssessmentValue,
  confidence: ConfidenceValue,
): number {
  const base = ASSESSMENT_SCORE_MAP[assessment];
  const modifier = CONFIDENCE_MODIFIER[confidence];
  return clampScore(Math.round(base * modifier));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Filter AI dimensions to those that were applicable; ignore extras.
 * Missing applicable dimensions are treated as UNKNOWN @ LOW.
 */
export function filterAndFillDimensions(
  applicable: ApplicableDimension[],
  assessments: DimensionAssessment[],
): DimensionAssessment[] {
  const byKey = new Map<string, DimensionAssessment>();
  for (const item of assessments) {
    byKey.set(`${item.component}::${item.dimension}`, item);
  }

  return applicable.map((dim) => {
    const key = `${dim.component}::${dim.dimension}`;
    const found = byKey.get(key);
    if (found) return found;
    return {
      dimension: dim.dimension,
      component: dim.component,
      assessment: "UNKNOWN",
      evidence: [],
      concerns: ["Dimension was not assessed by the model."],
      confidence: "LOW",
    };
  });
}

export function calculateComponentScores(
  dimensions: DimensionAssessment[],
): ComponentScores {
  const icp: number[] = [];
  const persona: number[] = [];
  const company: number[] = [];
  const product: number[] = [];
  let unknownDimensionCount = 0;

  for (const dim of dimensions) {
    if (dim.assessment === "UNKNOWN") unknownDimensionCount += 1;
    const score = assessmentToNumeric(dim.assessment, dim.confidence);
    switch (dim.component) {
      case "ICP":
        icp.push(score);
        break;
      case "PERSONA":
        persona.push(score);
        break;
      case "COMPANY":
        company.push(score);
        break;
      case "PRODUCT":
        product.push(score);
        break;
    }
  }

  // If a component has no applicable dimensions, use neutral 50 (UNKNOWN equivalent).
  const icpScore = clampScore(Math.round(average(icp) ?? 50));
  const personaScore = clampScore(Math.round(average(persona) ?? 50));
  const companyScore = clampScore(Math.round(average(company) ?? 50));
  const productRelevanceScore = clampScore(Math.round(average(product) ?? 50));

  const overallScore = clampScore(
    Math.round(
      icpScore * COMPONENT_WEIGHTS.icp +
        personaScore * COMPONENT_WEIGHTS.persona +
        companyScore * COMPONENT_WEIGHTS.company +
        productRelevanceScore * COMPONENT_WEIGHTS.productRelevance,
    ),
  );

  return {
    icpScore,
    personaScore,
    companyScore,
    productRelevanceScore,
    overallScore,
    unknownDimensionCount,
    scoredDimensionCount: dimensions.length,
  };
}

export function assignScoreLabel(
  overallScore: number,
  disqualified: boolean,
): ScoreLabelValue {
  if (disqualified) return "DISQUALIFIED";
  if (overallScore >= SCORE_LABEL_THRESHOLDS.excellentMin) return "EXCELLENT";
  if (overallScore >= SCORE_LABEL_THRESHOLDS.goodMin) return "GOOD";
  if (overallScore >= SCORE_LABEL_THRESHOLDS.fairMin) return "FAIR";
  return "POOR";
}

export type CalculatedScore = ComponentScores & {
  scoreLabel: ScoreLabelValue;
  dimensions: DimensionAssessment[];
  fitStrengths: string[];
  fitRisks: string[];
  disqualifiers: ResolvedDisqualifier[];
  recommendedAction: string;
  reasoning: string;
};

export function calculateScoresFromAssessment(input: {
  assessment: AiScoringAssessment;
  applicable: ApplicableDimension[];
  icp: IcpSnapshot;
}): CalculatedScore {
  const dimensions = filterAndFillDimensions(
    input.applicable,
    input.assessment.dimensions,
  );
  const components = calculateComponentScores(dimensions);
  const disqualifiers = resolveDisqualifiers(
    input.assessment.potentialDisqualifiers,
    input.icp,
  );
  const disqualified = disqualifiers.length > 0;
  const scoreLabel = assignScoreLabel(components.overallScore, disqualified);

  return {
    ...components,
    scoreLabel,
    dimensions,
    fitStrengths: input.assessment.fitStrengths,
    fitRisks: input.assessment.fitRisks,
    disqualifiers,
    recommendedAction: input.assessment.recommendedAction,
    reasoning: input.assessment.reasoning,
  };
}
