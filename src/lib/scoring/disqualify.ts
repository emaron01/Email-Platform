import {
  CONFIDENCE_MODIFIER,
  DISQUALIFIER_MIN_CONFIDENCE,
  type ConfidenceValue,
} from "@/lib/scoring/config";
import type { PotentialDisqualifier } from "@/lib/scoring/assessment";
import type { IcpSnapshot } from "@/lib/scoring/types";

export type ResolvedDisqualifier = {
  criterion: string;
  evidence: string[];
  confidence: ConfidenceValue;
  matchedIcpSignal: string;
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
): ResolvedDisqualifier[] {
  const negatives = (icp.negativeSignals ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  if (negatives.length === 0) return [];

  const minRank = confidenceRank(DISQUALIFIER_MIN_CONFIDENCE);
  const accepted: ResolvedDisqualifier[] = [];

  for (const item of proposed) {
    if (!item.evidence || item.evidence.length === 0) continue;
    if (confidenceRank(item.confidence) < minRank) continue;

    const criterionNorm = normalize(item.criterion);
    const matched = negatives.find((signal) => {
      const signalNorm = normalize(signal);
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
      matchedIcpSignal: matched,
    });
  }

  return accepted;
}
