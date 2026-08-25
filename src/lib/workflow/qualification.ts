import type { QualificationBucket, ScoreLabel } from "@prisma/client";
import {
  icpQualificationToBucket,
  readIcpQualification,
} from "@/lib/scoring/icp-qualification";

export const QUALIFICATION_BUCKETS = [
  "GOOD",
  "NEEDS_REVIEW",
  "EXCLUDED",
] as const satisfies readonly QualificationBucket[];

export const QUALIFICATION_BUCKET_LABELS: Record<QualificationBucket, string> =
  {
    GOOD: "Good",
    NEEDS_REVIEW: "Needs review",
    EXCLUDED: "Excluded",
  };

export function scoreLabelToBucket(
  scoreLabel: ScoreLabel | null,
  assessmentData?: unknown,
): QualificationBucket {
  return icpQualificationToBucket(
    readIcpQualification(assessmentData),
    scoreLabel,
  );
}

export type UnresolvedCriterion = {
  criterionId: string | null;
  name: string;
  reasoning: string;
};

export function firstUnresolvedCriterion(
  criterionAssessments: unknown,
): UnresolvedCriterion | null {
  if (!Array.isArray(criterionAssessments)) return null;
  for (const value of criterionAssessments) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const outcome = String(row.evidenceOutcome ?? "");
    const assessment = String(row.assessment ?? "");
    if (row.tier === "SECONDARY") continue;
    if (outcome !== "UNVERIFIABLE" && assessment !== "UNKNOWN") continue;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    return {
      criterionId: typeof row.criterionId === "string" ? row.criterionId : null,
      name,
      reasoning:
        String(row.reasoning ?? "").trim() ||
        `Cannot confirm ${name.toLowerCase()}.`,
    };
  }
  return null;
}

export function firstUnresolvedDimension(
  assessmentData: unknown,
): UnresolvedCriterion | null {
  if (!assessmentData || typeof assessmentData !== "object") return null;
  const dimensions = (assessmentData as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dimensions)) return null;
  for (const value of dimensions) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const assessment = String(row.assessment ?? "");
    if (
      assessment !== "UNKNOWN" &&
      assessment !== "WEAK" &&
      assessment !== "NO_FIT"
    ) {
      continue;
    }
    const name = String(row.dimension ?? "").trim();
    if (!name) continue;
    const concerns = Array.isArray(row.concerns)
      ? row.concerns.map(String).filter(Boolean)
      : [];
    return {
      criterionId: null,
      name,
      reasoning:
        concerns[0] ??
        `Cannot confirm ${name.toLowerCase()} from the available evidence.`,
    };
  }
  return null;
}
