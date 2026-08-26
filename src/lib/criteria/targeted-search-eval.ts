/**
 * Asymmetric evaluation for TARGETED_SEARCH ICP criteria.
 *
 * Presence of matching evidence → positive (CONFIRMED).
 * Presence of contradicting evidence → normal negative (CONTRADICTED).
 * Absence of evidence → NEUTRAL / UNVERIFIABLE — never a score penalty, never exclusion.
 */

import {
  evaluateCriterionDeterministic,
  formatConfirmedFactualMiss,
  type CriterionEvalResult,
} from "@/lib/criteria/evaluate";
import type { DimensionAssessment } from "@/lib/scoring/assessment";
import type { ConfidenceValue } from "@/lib/scoring/config";
import {
  isFactualEvidenceClass,
  normalizeEvidenceClass,
  type CriterionEvidenceClassValue,
} from "@/lib/criteria/evidence-class";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { icpCriterionTier } from "@/lib/scoring/icp-qualification";
import type { ActualProvenance } from "@/lib/criteria/research-cascade";

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
  provenance?: ActualProvenance | null;
  /** Prominent confirmed-miss line; omitted when unresolved or passing. */
  confirmedFailureLine?: string | null;
};

function observedDisplay(
  actualValue: unknown,
  provenance?: ActualProvenance | null,
): string {
  if (provenance?.displayValue?.trim()) return provenance.displayValue.trim();
  if (
    actualValue &&
    typeof actualValue === "object" &&
    "display" in actualValue &&
    typeof (actualValue as { display?: unknown }).display === "string"
  ) {
    return (actualValue as { display: string }).display;
  }
  if (actualValue == null) return "";
  return String(actualValue);
}

function confirmedFailureLineFor(
  criterion: CriterionSnapshot,
  actualValue: unknown,
  provenance?: ActualProvenance | null,
): string {
  return formatConfirmedFactualMiss({
    name: criterion.name,
    observed: observedDisplay(actualValue, provenance),
    operator: criterion.operator,
    minValue: criterion.minValue,
    maxValue: criterion.maxValue,
    targetValue: criterion.targetValue,
  });
}

/**
 * List data or a cited research sentence is not low-confidence.
 * Unresolved stays LOW. Missing provenance on a resolved deterministic value is HIGH.
 */
export function confidenceForResolvedFactual(input: {
  method: CriterionEvalResult["method"] | "ASYMMETRIC";
  confidence: CriterionEvalResult["confidence"];
  provenance?: ActualProvenance | null;
  unresolved: boolean;
}): ConfidenceValue {
  if (input.unresolved) return "LOW";
  if (input.provenance?.source === "LIST") return "HIGH";
  if (input.provenance?.source === "RESEARCH" && input.provenance.excerpt) {
    return "HIGH";
  }
  if (input.method === "DETERMINISTIC" || input.method === "ASYMMETRIC") {
    return input.confidence === "LOW" ? "HIGH" : input.confidence;
  }
  return input.confidence === "LOW" ? "MEDIUM" : input.confidence;
}

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
  provenance?: ActualProvenance | null;
}): CriterionEvidenceAssessment {
  const provenance = input.provenance ?? null;
  if (provenance?.hedged) {
    return applyCriterionTier(
      input.criterion,
      unverifiableAssessment({
        criterion: input.criterion,
        evidenceClass: normalizeEvidenceClass(
          input.criterion.evidenceClass ?? "TARGETED_SEARCH",
        ),
        reasoning: `Unverified: research for "${input.criterion.name}" is hedged, so it is not scored as a fact. ${provenance.label}`,
      }),
      provenance,
    );
  }
  return applyCriterionTier(
    input.criterion,
    evaluateIcpCriterionCore(input),
    provenance,
  );
}

function applyCriterionTier(
  criterion: CriterionSnapshot,
  result: CriterionEvidenceAssessment,
  provenance?: ActualProvenance | null,
): CriterionEvidenceAssessment {
  const tier = icpCriterionTier(criterion);
  const withProvenance = provenance
    ? { ...result, provenance }
    : result;
  if (tier === "SECONDARY") {
    return {
      ...withProvenance,
      tier,
      isMandatory: false,
      excludeFromScore: true,
    };
  }
  return {
    ...withProvenance,
    tier,
    isMandatory: Boolean(criterion.isMandatory),
  };
}

function evaluateIcpCriterionCore(input: {
  criterion: CriterionSnapshot;
  actualValue: unknown;
  provenance?: ActualProvenance | null;
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
        reasoning: `Unverified: no list data or research evidence for "${input.criterion.name}". Not scored.`,
      });
    }
    const failed = base.assessment === "NO_FIT";
    return {
      scope: "ICP",
      name: input.criterion.name,
      criterionId: input.criterion.id,
      evidenceClass,
      assessment: base.assessment,
      confidence: confidenceForResolvedFactual({
        method: base.method,
        confidence: base.confidence,
        provenance: input.provenance,
        unresolved: false,
      }),
      method: base.method,
      reasoning: base.reasoning,
      evidenceOutcome: failed ? "CONTRADICTED" : "CONFIRMED",
      excludeFromScore: false,
      factualAiForbidden,
      confirmedFailureLine: failed
        ? confirmedFailureLineFor(
            input.criterion,
            input.actualValue,
            input.provenance,
          )
        : null,
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
      reasoning: `Unverified: no online evidence for "${input.criterion.name}". Not scored.`,
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
      confirmedFailureLine: confirmedFailureLineFor(
        input.criterion,
        input.actualValue,
        input.provenance,
      ),
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
    (base.assessment === "WEAK" || base.assessment === "NO_FIT") &&
    !hasExplicitContradiction(input.actualValue)
  ) {
    return unverifiableAssessment({
      criterion: input.criterion,
      evidenceClass,
      reasoning: `Unverified: available online evidence does not confirm "${input.criterion.name}", and absence is not treated as contradiction. Not scored.`,
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
    confirmedFailureLine: confirmedFailureLineFor(
      input.criterion,
      input.actualValue,
      input.provenance,
    ),
  };
}

/**
 * Guard: factual ICP dimensions are scored by the cascade + deterministic eval.
 * The AI assessment is discarded — including when it happens to match NO_FIT —
 * so "no data" / LOW confidence cannot survive a resolved value.
 */
export function overlayFactualAiDimension(input: {
  dimension: DimensionAssessment;
  evidenceAssessment: CriterionEvidenceAssessment | undefined;
}): DimensionAssessment {
  const ev = input.evidenceAssessment;
  if (!ev || !ev.factualAiForbidden) return input.dimension;

  if (ev.evidenceOutcome === "UNVERIFIABLE" || ev.excludeFromScore) {
    return {
      dimension: input.dimension.dimension,
      component: input.dimension.component,
      assessment: "UNKNOWN",
      confidence: "LOW",
      evidence: [],
      concerns: [ev.reasoning],
    };
  }

  const assessment: DimensionAssessment["assessment"] =
    ev.assessment === "NEUTRAL"
      ? "UNKNOWN"
      : ev.assessment === "WEAK"
        ? "NO_FIT"
        : ev.assessment;
  const confidence = confidenceForResolvedFactual({
    method: ev.method,
    confidence: ev.confidence,
    provenance: ev.provenance,
    unresolved: false,
  });
  const evidence = [
    ev.provenance?.excerpt,
    ev.provenance?.label,
    ev.reasoning,
  ].filter((line): line is string => Boolean(line && line.trim()));
  const concerns =
    assessment === "NO_FIT"
      ? [ev.confirmedFailureLine ?? ev.reasoning]
      : [];

  return {
    dimension: input.dimension.dimension,
    component: input.dimension.component,
    assessment,
    confidence,
    evidence: [...new Set(evidence)],
    concerns,
  };
}

/** @deprecated use overlayFactualAiDimension — kept for existing call sites/tests. */
export function clampFactualAiDimension(input: {
  dimensionName: string;
  aiAssessment: string;
  evidenceAssessment: CriterionEvidenceAssessment | undefined;
}): {
  assessment: string;
  forced: boolean;
  reason?: string;
} {
  const overlaid = overlayFactualAiDimension({
    dimension: {
      dimension: input.dimensionName,
      component: "ICP",
      assessment: input.aiAssessment as DimensionAssessment["assessment"],
      evidence: [],
      concerns: [],
      confidence: "LOW",
    },
    evidenceAssessment: input.evidenceAssessment,
  });
  const forced =
    !input.evidenceAssessment ||
    !input.evidenceAssessment.factualAiForbidden
      ? false
      : overlaid.assessment !== input.aiAssessment ||
        overlaid.confidence !== "LOW" ||
        overlaid.concerns.length > 0;
  return {
    assessment: overlaid.assessment,
    forced:
      Boolean(input.evidenceAssessment?.factualAiForbidden) &&
      (overlaid.assessment !== input.aiAssessment || forced),
    reason: input.evidenceAssessment?.factualAiForbidden
      ? `Factual criterion "${input.dimensionName}" uses evidence-class evaluation, not AI inference.`
      : undefined,
  };
}

export function omitFactualIcpDimensionsForAi<
  T extends { component: string; dimension: string },
>(applicable: T[], assessments: CriterionEvidenceAssessment[]): T[] {
  const factual = new Set(
    assessments.filter((row) => row.factualAiForbidden).map((row) => row.name),
  );
  return applicable.filter(
    (row) => row.component !== "ICP" || !factual.has(row.dimension),
  );
}
