import {
  coerceIsMandatory,
  normalizeIcpCriterionTier,
  type IcpCriterionTierValue,
} from "@/lib/criteria/tier";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import type { CriterionEvidenceAssessment } from "@/lib/criteria/targeted-search-eval";
import type { DimensionAssessment } from "@/lib/scoring/assessment";
import type { ScoreLabelValue } from "@/lib/scoring/types";
import type { QualificationBucket } from "@prisma/client";

export type IcpQualificationBucket = "GOOD" | "MAYBE" | "NO";

export type SecondarySignalFlag = {
  name: string;
  text: string;
};

export type IcpQualification = {
  bucket: IcpQualificationBucket;
  secondaryFlags: SecondarySignalFlag[];
  primaryPassed: string[];
  primaryUnresolved: string[];
  primaryFailed: string[];
  mandatoryFailures: string[];
};

export function icpCriterionTier(
  criterion: Pick<CriterionSnapshot, "tier"> | null | undefined,
): IcpCriterionTierValue {
  return normalizeIcpCriterionTier(criterion?.tier) ?? "PRIMARY";
}

export function isSecondaryIcpCriterion(
  criterion: Pick<CriterionSnapshot, "tier"> | null | undefined,
): boolean {
  return icpCriterionTier(criterion) === "SECONDARY";
}

function isPassingAssessment(
  assessment: CriterionEvidenceAssessment | undefined,
  dimension: DimensionAssessment | undefined,
): boolean {
  const value = assessment?.assessment ?? dimension?.assessment;
  return value === "STRONG" || value === "MODERATE";
}

function isConfirmedFailure(
  assessment: CriterionEvidenceAssessment | undefined,
  dimension: DimensionAssessment | undefined,
): boolean {
  if (assessment?.evidenceOutcome === "CONTRADICTED") return true;
  const value = assessment?.assessment ?? dimension?.assessment;
  return value === "NO_FIT" || value === "WEAK";
}

function isUnresolved(
  assessment: CriterionEvidenceAssessment | undefined,
  dimension: DimensionAssessment | undefined,
): boolean {
  if (assessment?.excludeFromScore) return true;
  if (assessment?.evidenceOutcome === "UNVERIFIABLE") return true;
  const value = assessment?.assessment ?? dimension?.assessment;
  return value === "UNKNOWN" || value === "NEUTRAL" || value == null;
}

export function resolveIcpQualification(input: {
  criteria: CriterionSnapshot[];
  assessments: CriterionEvidenceAssessment[];
  dimensions?: DimensionAssessment[];
}): IcpQualification {
  const byName = new Map(input.assessments.map((row) => [row.name, row]));
  const dimByName = new Map(
    (input.dimensions ?? [])
      .filter((row) => row.component === "ICP")
      .map((row) => [row.dimension, row]),
  );

  const primaryPassed: string[] = [];
  const primaryUnresolved: string[] = [];
  const primaryFailed: string[] = [];
  const mandatoryFailures: string[] = [];
  const secondaryFlags: SecondarySignalFlag[] = [];

  for (const criterion of input.criteria) {
    const assessment = byName.get(criterion.name);
    const dimension = dimByName.get(criterion.name);
    const tier = icpCriterionTier(criterion);
    if (tier === "SECONDARY") {
      if (isPassingAssessment(assessment, dimension)) {
        secondaryFlags.push({
          name: criterion.name,
          text: `${criterion.name} ✓`,
        });
      }
      continue;
    }

    const mandatory = coerceIsMandatory(tier, criterion.isMandatory);
    if (isConfirmedFailure(assessment, dimension)) {
      primaryFailed.push(criterion.name);
      if (mandatory) mandatoryFailures.push(criterion.name);
      continue;
    }
    if (isUnresolved(assessment, dimension)) {
      primaryUnresolved.push(criterion.name);
      continue;
    }
    if (isPassingAssessment(assessment, dimension)) {
      primaryPassed.push(criterion.name);
    } else {
      primaryUnresolved.push(criterion.name);
    }
  }

  const bucket: IcpQualificationBucket =
    mandatoryFailures.length > 0
      ? "NO"
      : primaryUnresolved.length > 0
        ? "MAYBE"
        : primaryFailed.length > 0
          ? "MAYBE"
          : "GOOD";

  return {
    bucket,
    secondaryFlags,
    primaryPassed,
    primaryUnresolved,
    primaryFailed,
    mandatoryFailures,
  };
}

export function icpQualificationToScoreLabel(
  qualification: IcpQualification,
  disqualified: boolean,
  overallLabel: ScoreLabelValue,
): ScoreLabelValue {
  if (disqualified || qualification.bucket === "NO") return "DISQUALIFIED";
  if (qualification.bucket === "MAYBE" && overallLabel === "POOR") {
    return "FAIR";
  }
  return overallLabel;
}

export function icpQualificationToBucket(
  qualification: IcpQualification | null | undefined,
  scoreLabel: ScoreLabelValue | null,
): QualificationBucket {
  if (qualification?.bucket === "NO") return "EXCLUDED";
  if (scoreLabel === "DISQUALIFIED") return "EXCLUDED";
  if (qualification?.bucket === "MAYBE") return "NEEDS_REVIEW";
  if (qualification?.bucket === "GOOD") return "GOOD";
  if (scoreLabel === "EXCELLENT" || scoreLabel === "GOOD") return "GOOD";
  if (scoreLabel === "POOR") return "EXCLUDED";
  return "NEEDS_REVIEW";
}

export function icpQualificationWhyLines(qualification: IcpQualification): {
  passed: string;
  unresolved: string;
  failed: string;
  mandatory: string | null;
  secondary: string;
} {
  const names = (values: string[]) =>
    values.length > 0 ? values.join(", ") : "None";
  return {
    passed: names(qualification.primaryPassed),
    unresolved: names(qualification.primaryUnresolved),
    failed: names(qualification.primaryFailed),
    mandatory:
      qualification.mandatoryFailures.length > 0
        ? names(qualification.mandatoryFailures)
        : null,
    secondary:
      qualification.secondaryFlags.length > 0
        ? qualification.secondaryFlags.map((flag) => flag.text).join(", ")
        : "None",
  };
}

export function readIcpQualification(
  assessmentData: unknown,
): IcpQualification | null {
  if (!assessmentData || typeof assessmentData !== "object") return null;
  const raw = (assessmentData as { icpQualification?: unknown })
    .icpQualification;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<IcpQualification>;
  if (row.bucket !== "GOOD" && row.bucket !== "MAYBE" && row.bucket !== "NO") {
    return null;
  }
  return {
    bucket: row.bucket,
    secondaryFlags: Array.isArray(row.secondaryFlags)
      ? row.secondaryFlags.filter(
          (flag): flag is SecondarySignalFlag =>
            Boolean(flag) &&
            typeof flag === "object" &&
            typeof flag.name === "string" &&
            typeof flag.text === "string",
        )
      : [],
    primaryPassed: Array.isArray(row.primaryPassed)
      ? row.primaryPassed.map(String)
      : [],
    primaryUnresolved: Array.isArray(row.primaryUnresolved)
      ? row.primaryUnresolved.map(String)
      : [],
    primaryFailed: Array.isArray(row.primaryFailed)
      ? row.primaryFailed.map(String)
      : [],
    mandatoryFailures: Array.isArray(row.mandatoryFailures)
      ? row.mandatoryFailures.map(String)
      : [],
  };
}
