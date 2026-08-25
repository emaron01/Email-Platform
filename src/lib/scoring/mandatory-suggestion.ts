import { coerceIsMandatory } from "@/lib/criteria/tier";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { icpCriterionTier } from "@/lib/scoring/icp-qualification";

export type MandatorySuggestion = {
  criterionId: string;
  criterionName: string;
  failedCompanyCount: number;
  prompt: string;
};

function isConfirmedMiss(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const assessment = row as {
    evidenceOutcome?: unknown;
    assessment?: unknown;
    excludeFromScore?: unknown;
    tier?: unknown;
  };
  if (assessment.tier === "SECONDARY") return false;
  if (assessment.excludeFromScore) return false;
  if (assessment.evidenceOutcome === "UNVERIFIABLE") return false;
  return (
    assessment.evidenceOutcome === "CONTRADICTED" ||
    assessment.assessment === "NO_FIT"
  );
}

function assessmentsFromScore(score: {
  criterionAssessments?: unknown;
  assessmentData?: unknown;
}): unknown[] {
  if (Array.isArray(score.criterionAssessments)) {
    return score.criterionAssessments;
  }
  if (score.assessmentData && typeof score.assessmentData === "object") {
    const rows = (score.assessmentData as { criterionAssessments?: unknown })
      .criterionAssessments;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

export function collectMandatorySuggestions(input: {
  criteria: CriterionSnapshot[];
  scores: Array<{
    companyKey: string;
    criterionAssessments?: unknown;
    assessmentData?: unknown;
  }>;
}): MandatorySuggestion[] {
  const suggestions: MandatorySuggestion[] = [];
  for (const criterion of input.criteria) {
    if (icpCriterionTier(criterion) !== "PRIMARY") continue;
    if (coerceIsMandatory("PRIMARY", criterion.isMandatory)) continue;
    const id = criterion.id?.trim();
    if (!id) continue;

    const companies = new Set<string>();
    for (const score of input.scores) {
      const hit = assessmentsFromScore(score).some((row) => {
        if (!row || typeof row !== "object") return false;
        const name = String((row as { name?: unknown }).name ?? "");
        if (name !== criterion.name) return false;
        return isConfirmedMiss(row);
      });
      if (hit) companies.add(score.companyKey);
    }
    if (companies.size === 0) continue;
    const n = companies.size;
    const companyWord = n === 1 ? "company" : "companies";
    const them = n === 1 ? "it" : "them";
    suggestions.push({
      criterionId: id,
      criterionName: criterion.name,
      failedCompanyCount: n,
      prompt: `${n} ${companyWord} confirmed as a miss on ${criterion.name}. Make this mandatory to exclude ${them} automatically?`,
    });
  }
  return suggestions;
}
