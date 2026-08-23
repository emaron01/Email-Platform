/**
 * Asymmetric evaluation for TARGETED_SEARCH ICP criteria.
 *
 * Presence of matching evidence → positive (CONFIRMED).
 * Presence of contradicting evidence → normal negative (CONTRADICTED).
 * Absence of evidence → NEUTRAL / UNVERIFIABLE — never a score penalty, never exclusion.
 */

import {
  evaluateCriterionDeterministic,
  type CriterionEvalResult,
} from "@/lib/criteria/evaluate";
import {
  isFactualEvidenceClass,
  normalizeEvidenceClass,
  type CriterionEvidenceClassValue,
} from "@/lib/criteria/evidence-class";
import type { CriterionSnapshot } from "@/lib/criteria/types";

export type TargetedSearchEvidenceOutcome =
  | "CONFIRMED"
  | "CONTRADICTED"
  | "UNVERIFIABLE"
  | "NOT_APPLICABLE";

export type CriterionEvidenceAssessment = {
  scope: "ICP" | "PERSONA";
  name: string;
  criterionId?: string;
  evidenceClass: CriterionEvidenceClassValue;
  assessment: CriterionEvalResult["assessment"] | "NEUTRAL";
  confidence: CriterionEvalResult["confidence"];
  method: CriterionEvalResult["method"] | "ASYMMETRIC";
  reasoning: string;
  /** TARGETED_SEARCH outcomes for UI: Confirmed vs Unverified. */
  evidenceOutcome: TargetedSearchEvidenceOutcome;
  /** When true, this criterion must not contribute to component averages. */
  excludeFromScore: boolean;
  /** When true, AI dimension for this criterion must not invent a factual result. */
  factualAiForbidden: boolean;
};

/**
 * Evaluate one ICP criterion with evidence-class rules.
 * TARGETED_SEARCH with no evidence → NEUTRAL / UNVERIFIABLE (never NO_FIT, never exclusion).
 */
export function evaluateIcpCriterionWithEvidenceClass(input: {
  criterion: CriterionSnapshot;
  actualValue: unknown;
}): CriterionEvidenceAssessment {
  const evidenceClass = normalizeEvidenceClass(
    input.criterion.evidenceClass ?? "TARGETED_SEARCH",
  );
  const base = evaluateCriterionDeterministic({
    criterion: input.criterion,
    actualValue: input.actualValue,
  });
  const factualAiForbidden = isFactualEvidenceClass(evidenceClass);

  if (evidenceClass !== "TARGETED_SEARCH") {
    return {
      scope: "ICP",
      name: input.criterion.name,
      criterionId: input.criterion.id,
      evidenceClass,
      assessment: base.assessment,
      confidence: base.confidence,
      method: base.method,
      reasoning: base.reasoning,
      evidenceOutcome: "NOT_APPLICABLE",
      excludeFromScore: false,
      factualAiForbidden,
    };
  }

  // TARGETED_SEARCH asymmetry
  if (
    input.actualValue == null ||
    input.actualValue === "" ||
    base.assessment === "UNKNOWN" ||
    base.method === "UNKNOWN"
  ) {
    return {
      scope: "ICP",
      name: input.criterion.name,
      criterionId: input.criterion.id,
      evidenceClass,
      assessment: "NEUTRAL",
      confidence: "LOW",
      method: "ASYMMETRIC",
      reasoning: `Unverified: no online evidence for "${input.criterion.name}". Not scored against the company.`,
      evidenceOutcome: "UNVERIFIABLE",
      excludeFromScore: true,
      factualAiForbidden: true,
    };
  }

  if (base.assessment === "STRONG" || base.assessment === "MODERATE") {
    return {
      scope: "ICP",
      name: input.criterion.name,
      criterionId: input.criterion.id,
      evidenceClass,
      assessment: base.assessment,
      confidence: base.confidence,
      method: "ASYMMETRIC",
      reasoning: `Confirmed: ${base.reasoning}`,
      evidenceOutcome: "CONFIRMED",
      excludeFromScore: false,
      factualAiForbidden: true,
    };
  }

  // Contradicting evidence — normal negative / disqualification path.
  return {
    scope: "ICP",
    name: input.criterion.name,
    criterionId: input.criterion.id,
    evidenceClass,
    assessment: base.assessment === "WEAK" ? "NO_FIT" : base.assessment,
    confidence: base.confidence,
    method: "ASYMMETRIC",
    reasoning: `Contradicted: ${base.reasoning}`,
    evidenceOutcome: "CONTRADICTED",
    excludeFromScore: false,
    factualAiForbidden: true,
  };
}

/**
 * Guard: strip or clamp AI dimension assessments that try to invent factual results.
 * TARGETED_SEARCH UNVERIFIABLE dimensions are forced to UNKNOWN and marked excludeFromScore
 * by the caller via criterionAssessments.
 */
export function clampFactualAiDimension(input: {
  dimensionName: string;
  aiAssessment: string;
  evidenceAssessment: CriterionEvidenceAssessment | undefined;
}): {
  assessment: string;
  forced: boolean;
  reason?: string;
} {
  const ev = input.evidenceAssessment;
  if (!ev || !ev.factualAiForbidden) {
    return { assessment: input.aiAssessment, forced: false };
  }

  if (ev.evidenceOutcome === "UNVERIFIABLE" || ev.excludeFromScore) {
    return {
      assessment: "UNKNOWN",
      forced: true,
      reason: `Factual TARGETED_SEARCH criterion "${input.dimensionName}" has no evidence — AI may not invent a result.`,
    };
  }

  // Prefer deterministic/asymmetric assessment over AI for factual classes.
  if (ev.method === "DETERMINISTIC" || ev.method === "ASYMMETRIC") {
    const mapped =
      ev.assessment === "NEUTRAL" ? "UNKNOWN" : ev.assessment;
    if (mapped !== input.aiAssessment) {
      return {
        assessment: mapped,
        forced: true,
        reason: `Factual criterion "${input.dimensionName}" uses evidence-class evaluation, not AI inference.`,
      };
    }
  }

  return { assessment: input.aiAssessment, forced: false };
}
