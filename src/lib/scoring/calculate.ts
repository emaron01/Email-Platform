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
  isFactualEvidenceClass,
  normalizeEvidenceClass,
} from "@/lib/criteria/evidence-class";
import {
  overlayFactualAiDimension,
  type CriterionEvidenceAssessment,
} from "@/lib/criteria/targeted-search-eval";
import {
  resolveDisqualifiers,
  type ResolvedDisqualifier,
} from "@/lib/scoring/disqualify";
import type { IcpSnapshot, PersonaSnapshot } from "@/lib/scoring/types";
import type { ScoringContactResearchInput } from "@/lib/scoring/payload";
import type { PersonaExclusionAssessment } from "@/lib/scoring/persona-exclusions";
import {
  icpQualificationToScoreLabel,
  isSecondaryIcpCriterion,
  resolveIcpQualification,
  type IcpQualification,
} from "@/lib/scoring/icp-qualification";

export type ComponentScores = {
  icpScore: number;
  personaScore: number;
  companyScore: number;
  productRelevanceScore: number;
  overallScore: number;
  unknownDimensionCount: number;
  scoredDimensionCount: number;
  componentCoverage: {
    icp: { evaluated: number; total: number };
    persona: { evaluated: number; total: number };
    company: { evaluated: number; total: number };
    product: { evaluated: number; total: number };
  };
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
  options?: {
    /** Dimension names (ICP component) to exclude from averages (TARGETED_SEARCH UNVERIFIABLE). */
    excludeIcpDimensionNames?: Set<string>;
  },
): ComponentScores {
  const icp: number[] = [];
  const persona: number[] = [];
  const company: number[] = [];
  const product: number[] = [];
  let unknownDimensionCount = 0;
  const exclude = options?.excludeIcpDimensionNames ?? new Set<string>();
  const totals = {
    icp: 0,
    persona: 0,
    company: 0,
    product: 0,
  };

  for (const dim of dimensions) {
    const componentKey =
      dim.component === "PRODUCT" ? "product" : dim.component.toLowerCase();
    totals[componentKey as keyof typeof totals] += 1;
    if (dim.assessment === "UNKNOWN") unknownDimensionCount += 1;
    if (
      dim.component === "ICP" &&
      (exclude.has(dim.dimension) || dim.assessment === "UNKNOWN")
    ) {
      // Unresolvable ICP criteria never contribute a midpoint or remain in the denominator.
      continue;
    }
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
    scoredDimensionCount:
      icp.length + persona.length + company.length + product.length,
    componentCoverage: {
      icp: { evaluated: icp.length, total: totals.icp },
      persona: { evaluated: persona.length, total: totals.persona },
      company: { evaluated: company.length, total: totals.company },
      product: { evaluated: product.length, total: totals.product },
    },
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
  /** Persisted on ContactScore.criterionAssessments / assessmentData. */
  criterionEvidenceAssessments?: CriterionEvidenceAssessment[];
  icpQualification: IcpQualification;
};

function factualEvidenceForDimension(
  dimensionName: string,
  evidenceByName: Map<string, CriterionEvidenceAssessment>,
  icp: IcpSnapshot,
): CriterionEvidenceAssessment | undefined {
  const existing = evidenceByName.get(dimensionName);
  if (existing) return existing;
  const criterion = (icp.criteria ?? []).find(
    (entry) => entry.name === dimensionName,
  );
  if (!criterion) return undefined;
  const evidenceClass = normalizeEvidenceClass(criterion.evidenceClass);
  if (!isFactualEvidenceClass(evidenceClass)) return undefined;
  // Fail closed: a factual criterion without a deterministic assessment
  // cannot be satisfied by the AI response.
  return {
    scope: "ICP",
    name: criterion.name,
    criterionId: criterion.id,
    evidenceClass,
    assessment: "NEUTRAL",
    confidence: "LOW",
    method: "ASYMMETRIC",
    reasoning: `Unverified: no evidence for "${criterion.name}". Not scored.`,
    evidenceOutcome: "UNVERIFIABLE",
    excludeFromScore: true,
    factualAiForbidden: true,
  };
}

export function calculateScoresFromAssessment(input: {
  assessment: AiScoringAssessment;
  applicable: ApplicableDimension[];
  icp: IcpSnapshot;
  persona?: PersonaSnapshot;
  contactResearch?: ScoringContactResearchInput;
  personaExclusionAssessments?: PersonaExclusionAssessment[];
  criterionEvidenceAssessments?: CriterionEvidenceAssessment[];
}): CalculatedScore {
  const evidenceByName = new Map(
    (input.criterionEvidenceAssessments ?? []).map((e) => [e.name, e]),
  );

  const dimensions = filterAndFillDimensions(
    input.applicable,
    input.assessment.dimensions,
  ).map((dim) => {
    if (dim.component !== "ICP") return dim;
    const ev = factualEvidenceForDimension(
      dim.dimension,
      evidenceByName,
      input.icp,
    );
    return overlayFactualAiDimension({
      dimension: dim,
      evidenceAssessment: ev,
    });
  });

  const excludeIcpDimensionNames = new Set([
    ...(input.icp.criteria ?? [])
      .filter((criterion) => isSecondaryIcpCriterion(criterion))
      .map((criterion) => criterion.name),
    ...(input.applicable ?? [])
      .filter((dim) => dim.component === "ICP")
      .map((dim) =>
        factualEvidenceForDimension(dim.dimension, evidenceByName, input.icp),
      )
      .filter((e): e is CriterionEvidenceAssessment =>
        Boolean(e?.excludeFromScore),
      )
      .map((e) => e.name),
  ]);

  const components = calculateComponentScores(dimensions, {
    excludeIcpDimensionNames,
  });
  const icpQualification = resolveIcpQualification({
    criteria: input.icp.criteria ?? [],
    assessments: input.criterionEvidenceAssessments ?? [],
    dimensions,
  });
  const proposedDisqualifiers = resolveDisqualifiers(
    input.assessment.potentialDisqualifiers,
    input.icp,
    {
      persona: input.persona,
      contactResearch: input.contactResearch,
    },
  ).filter((d) => {
    // Asymmetry guard: unverifiable factual criteria must never exclude.
    const ev = factualEvidenceForDimension(
      d.criterion,
      evidenceByName,
      input.icp,
    );
    const criterion = (input.icp.criteria ?? []).find(
      (entry) => entry.name === d.criterion,
    );
    if (isSecondaryIcpCriterion(criterion)) return false;
    return !(ev?.excludeFromScore || ev?.evidenceOutcome === "UNVERIFIABLE");
  });
  const deterministicPersonaDisqualifiers: ResolvedDisqualifier[] = (
    input.personaExclusionAssessments ?? []
  )
    .filter((assessment) => assessment.outcome === "CONFIRMED")
    .map((assessment) => ({
      criterion: assessment.criterion,
      evidence: assessment.evidence,
      confidence: assessment.confidence,
      scope: "PERSONA",
      matchedPersonaCriterion: assessment.criterion,
    }));
  const mandatoryDisqualifiers: ResolvedDisqualifier[] =
    icpQualification.mandatoryFailures.map((name) => {
      const assessment = evidenceByName.get(name);
      return {
        criterion: name,
        evidence: assessment?.reasoning ? [assessment.reasoning] : [],
        confidence: assessment?.confidence === "HIGH" ? "HIGH" : "MEDIUM",
        scope: "ICP" as const,
        matchedIcpSignal: name,
      };
    });
  const disqualifiers = [
    ...proposedDisqualifiers,
    ...mandatoryDisqualifiers,
    ...deterministicPersonaDisqualifiers,
  ];
  const disqualified = disqualifiers.length > 0;
  let scoreLabel = assignScoreLabel(components.overallScore, disqualified);
  scoreLabel = icpQualificationToScoreLabel(
    icpQualification,
    disqualified,
    scoreLabel,
  );
  if (
    scoreLabel === "POOR" &&
    components.componentCoverage.icp.evaluated <
      components.componentCoverage.icp.total
  ) {
    scoreLabel = "FAIR";
  }
  const primaryCount = (input.icp.criteria ?? []).filter(
    (criterion) => !isSecondaryIcpCriterion(criterion),
  ).length;
  if (primaryCount > 0) {
    components.componentCoverage.icp.total = primaryCount;
  }
  const unresolvedIcpGaps = (input.criterionEvidenceAssessments ?? [])
    .filter(
      (assessment) =>
        assessment.excludeFromScore && assessment.tier !== "SECONDARY",
    )
    .map((assessment) => assessment.reasoning);
  const fitRisks = Array.from(
    new Set([...input.assessment.fitRisks, ...unresolvedIcpGaps]),
  );

  return {
    ...components,
    scoreLabel,
    dimensions,
    fitStrengths: input.assessment.fitStrengths,
    fitRisks,
    disqualifiers,
    recommendedAction: input.assessment.recommendedAction,
    reasoning: input.assessment.reasoning,
    criterionEvidenceAssessments: input.criterionEvidenceAssessments,
    icpQualification,
  };
}
