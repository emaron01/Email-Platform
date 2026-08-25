import {
  CONFIDENCE_MODIFIER,
  DISQUALIFIER_MIN_CONFIDENCE,
  type ConfidenceValue,
} from "@/lib/scoring/config";
import type { PotentialDisqualifier } from "@/lib/scoring/assessment";
import type { ScoringContactResearchInput } from "@/lib/scoring/payload";
import type { IcpSnapshot, PersonaSnapshot } from "@/lib/scoring/types";

export type ResolvedDisqualifier = {
  criterion: string;
  evidence: string[];
  confidence: ConfidenceValue;
  scope: "ICP" | "PERSONA";
  matchedIcpSignal?: string;
  matchedPersonaCriterion?: string;
};

function confidenceRank(value: ConfidenceValue): number {
  return CONFIDENCE_MODIFIER[value];
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Application-owned disqualification.
 * Requires: explicit ICP negative criterion match, supporting evidence, adequate confidence.
 * Speculative / low-confidence proposals are rejected.
 */
export function resolveDisqualifiers(
  proposed: PotentialDisqualifier[],
  icp: IcpSnapshot,
  options?: {
    persona?: PersonaSnapshot;
    contactResearch?: ScoringContactResearchInput;
  },
): ResolvedDisqualifier[] {
  const candidates: Array<{
    scope: "ICP" | "PERSONA";
    criterion: string;
  }> = (icp.negativeSignals ?? [])
    .map((criterion) => ({ scope: "ICP" as const, criterion: criterion.trim() }))
    .filter((item) => Boolean(item.criterion));
  const contactResearch = options?.contactResearch;
  const personaEvidenceAvailable =
    contactResearch != null &&
    (contactResearch.status === "COMPLETED" ||
      contactResearch.status === "PARTIAL") &&
    (contactResearch.confidence === "HIGH" ||
      contactResearch.confidence === "MEDIUM");
  if (personaEvidenceAvailable) {
    for (const criterion of options?.persona?.criteria ?? []) {
      if (
        criterion.isDisqualifier &&
        criterion.exclusionTestability === "EVIDENCE_TESTABLE"
      ) {
        candidates.push({ scope: "PERSONA", criterion: criterion.name });
      }
    }
  }

  if (candidates.length === 0) return [];

  const minRank = confidenceRank(DISQUALIFIER_MIN_CONFIDENCE);
  const accepted: ResolvedDisqualifier[] = [];

  for (const item of proposed) {
    if (!item.evidence || item.evidence.length === 0) continue;
    if (confidenceRank(item.confidence) < minRank) continue;

    const criterionNorm = normalize(item.criterion);
    const matched = candidates.find((candidate) => {
      const signalNorm = normalize(candidate.criterion);
      return (
        criterionNorm.includes(signalNorm) ||
        signalNorm.includes(criterionNorm) ||
        criterionNorm === signalNorm
      );
    });

    if (!matched) continue;

    accepted.push({
      criterion: item.criterion,
      evidence: item.evidence,
      confidence: item.confidence,
      scope: matched.scope,
      matchedIcpSignal:
        matched.scope === "ICP" ? matched.criterion : undefined,
      matchedPersonaCriterion:
        matched.scope === "PERSONA" ? matched.criterion : undefined,
    });
  }

  return accepted;
}
