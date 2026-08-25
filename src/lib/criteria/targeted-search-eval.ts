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
import { icpCriterionTier } from "@/lib/scoring/icp-qualification";

export type TargetedSearchEvidenceOutcome =
  "CONFIRMED" | "CONTRADICTED" | "UNVERIFIABLE" | "NOT_APPLICABLE";

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
  tier?: "PRIMARY" | "SECONDARY";
  isMandatory?: boolean;
};

function unverifiableAssessment(input: {
  criterion: CriterionSnapshot;
  evidenceClass: CriterionEvidenceClassValue;
  reasoning: string;
}): CriterionEvidenceAssessment {
  return {
    scope: "ICP",
    name: input.criterion.name,
    criterionId: input.criterion.id,
    evidenceClass: input.evidenceClass,
    assessment: "NEUTRAL",
    confidence: "LOW",
    method: "ASYMMETRIC",
    reasoning: input.reasoning,
    evidenceOutcome: "UNVERIFIABLE",
    excludeFromScore: true,
    factualAiForbidden: true,
  };
}

function hasExplicitContradiction(actualValue: unknown): boolean {
  const text = Array.isArray(actualValue)
    ? actualValue.map(String).join(" ")
    : String(actualValue ?? "");
  return /\b(?:no|not|never|without|only|exclusively|lacks?|instead of|does not|doesn't)\b/i.test(
    text,
  );
}

/**
 * Evaluate one ICP criterion with evidence-class rules.
 * TARGETED_SEARCH with no evidence → NEUTRAL / UNVERIFIABLE (never NO_FIT, never disqualification).
 */
export function evaluateIcpCriterionWithEvidenceClass(input: {
  criterion: CriterionSnapshot;
  actualValue: unknown;
}): CriterionEvidenceAssessment {
  return applyCriterionTier(input.criterion, evaluateIcpCriterionCore(input));
}

function applyCriterionTier(
  criterion: CriterionSnapshot,
  result: CriterionEvidenceAssessment,
): CriterionEvidenceAssessment {
  const tier = icpCriterionTier(criterion);
  if (tier === "SECONDARY") {
    return {
      ...result,
      tier,
      isMandatory: false,
      excludeFromScore: true,
    };
  }
  return {
    ...result,
    tier,
    isMandatory: Boolean(criterion.isMandatory),
  };
}

function evaluateIcpCriterionCore(input: {
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
    if (
      factualAiForbidden &&
      (base.assessment === "UNKNOWN" || base.method === "UNKNOWN")
    ) {
      return unverifiableAssessment({
        criterion: input.criterion,
        evidenceClass,
        reasoning: `Unverified: no ${evidenceClass === "LIST_DATA" ? "list data" : "company research evidence"} for "${input.criterion.name}". Not scored against the company.`,
      });
    }
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
    return unverifiableAssessment({
      criterion: input.criterion,
      evidenceClass,
      reasoning: `Unverified: no online evidence for "${input.criterion.name}". Not scored against the company.`,
    });
  }

  if (hasExplicitContradiction(input.actualValue)) {
    return {
      scope: "ICP",
      name: input.criterion.name,
      criterionId: input.criterion.id,
      evidenceClass,
      assessment: "NO_FIT",
      confidence: "MEDIUM",
      method: "ASYMMETRIC",
      reasoning: `Contradicted: explicit evidence conflicts with "${input.criterion.name}".`,
      evidenceOutcome: "CONTRADICTED",
      excludeFromScore: false,
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

  if (
    base.assessment === "WEAK" &&
    !hasExplicitContradiction(input.actualValue)
  ) {
    return unverifiableAssessment({
      criterion: input.criterion,
      evidenceClass,
      reasoning: `Unverified: available online evidence does not confirm "${input.criterion.name}", and absence is not treated as contradiction. Not scored against the company.`,
    });
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
 * Unverifiable factual dimensions are forced to UNKNOWN and marked excludeFromScore by
 * the caller via criterionAssessments.
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
      reason: `Factual criterion "${input.dimensionName}" has no evidence — AI may not invent a result.`,
    };
  }

  // Prefer deterministic/asymmetric assessment over AI for factual classes.
  if (ev.method === "DETERMINISTIC" || ev.method === "ASYMMETRIC") {
    const mapped = ev.assessment === "NEUTRAL" ? "UNKNOWN" : ev.assessment;
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
