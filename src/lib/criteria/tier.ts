/**
 * ICP criterion tier (PRIMARY / SECONDARY) and mandatory flag.
 *
 * Proposal (AI + app fallback): firmographics that define a customer are PRIMARY;
 * tooling, tech stack, timing, and in-flight initiatives are SECONDARY.
 * isMandatory is never proposed — only a user may set it, and only on PRIMARY.
 *
 * Migration of existing rows is independent: TARGETED_SEARCH → SECONDARY,
 * everything else → PRIMARY, isMandatory false.
 */

import {
  normalizeEvidenceClass,
  type CriterionEvidenceClassValue,
} from "@/lib/criteria/evidence-class";

export const ICP_CRITERION_TIERS = ["PRIMARY", "SECONDARY"] as const;
export type IcpCriterionTierValue = (typeof ICP_CRITERION_TIERS)[number];

export type IcpCriterionTierAssignment = {
  id?: string;
  name: string;
  criterionType: string;
  evidenceClass: CriterionEvidenceClassValue;
  tier: IcpCriterionTierValue;
  isMandatory: false;
  reason: string;
};

export function normalizeIcpCriterionTier(
  raw: unknown,
): IcpCriterionTierValue | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if (upper === "PRIMARY" || upper === "SECONDARY") return upper;
  return null;
}

function criterionBlob(input: {
  name: string;
  criterionType: string;
  description?: string | null;
}): string {
  return [input.criterionType, input.name, input.description ?? ""]
    .join(" ")
    .toLowerCase();
}

const SECONDARY_PATTERN =
  /\b(salesforce|hubspot|crm|technolog|tooling|tech stack|stack|certif|vmware|replacing|initiative|in[-\s]flight|timing|buying signal|currently uses)\b/;
const PRIMARY_FIRMOGRAPHIC_PATTERN =
  /\b(industry|industries|employee|headcount|revenue|arr|geography|geographies|location|business model|company size|firmographic)\b/;

/**
 * App-owned proposal used when the model omits/invalidates tier, and as the
 * documented rule the interpretation prompt must follow.
 */
export function proposeIcpCriterionTier(input: {
  name: string;
  criterionType: string;
  description?: string | null;
  evidenceClass?: CriterionEvidenceClassValue | string | null;
  isDisqualifier?: boolean;
}): IcpCriterionTierValue {
  if (input.isDisqualifier) return "PRIMARY";

  const blob = criterionBlob(input);
  const secondaryHit = SECONDARY_PATTERN.test(blob);
  const primaryHit = PRIMARY_FIRMOGRAPHIC_PATTERN.test(blob);

  if (secondaryHit && !primaryHit) return "SECONDARY";
  if (primaryHit) return "PRIMARY";

  const evidenceClass = normalizeEvidenceClass(input.evidenceClass);
  if (evidenceClass === "TARGETED_SEARCH") return "SECONDARY";
  return "PRIMARY";
}

export function resolveProposedIcpCriterionTier(input: {
  proposedTier?: unknown;
  name: string;
  criterionType: string;
  description?: string | null;
  evidenceClass?: CriterionEvidenceClassValue | string | null;
  isDisqualifier?: boolean;
}): IcpCriterionTierValue {
  return (
    normalizeIcpCriterionTier(input.proposedTier) ??
    proposeIcpCriterionTier(input)
  );
}

/** Existing-row migration: classed TARGETED_SEARCH → SECONDARY; else PRIMARY. */
export function migrateExistingIcpCriterionTier(
  evidenceClass: unknown,
): IcpCriterionTierValue {
  return normalizeEvidenceClass(evidenceClass) === "TARGETED_SEARCH"
    ? "SECONDARY"
    : "PRIMARY";
}

export function assignMigratedIcpCriterionTier(input: {
  id?: string;
  name: string;
  criterionType: string;
  evidenceClass: unknown;
}): IcpCriterionTierAssignment {
  const evidenceClass = normalizeEvidenceClass(input.evidenceClass);
  const tier = migrateExistingIcpCriterionTier(evidenceClass);
  return {
    id: input.id,
    name: input.name,
    criterionType: input.criterionType,
    evidenceClass,
    tier,
    isMandatory: false,
    reason:
      tier === "SECONDARY"
        ? "Existing TARGETED_SEARCH criterion migrated to SECONDARY."
        : "Existing non-TARGETED_SEARCH criterion migrated to PRIMARY.",
  };
}

/** SECONDARY can never be mandatory. Unset / invalid → false. */
export function coerceIsMandatory(
  tier: IcpCriterionTierValue,
  isMandatory: unknown,
): boolean {
  if (tier !== "PRIMARY") return false;
  return isMandatory === true;
}

/** One-line model for the ICP editor — the user should not need docs. */
export const ICP_TIER_MODEL_LINE =
  "Primary criteria define your fit and drive the score. Secondary criteria are signals that help you prioritise but never disqualify. Mandatory criteria disqualify on confirmed failure only.";

export const ICP_PRIMARY_TIER_HEADER =
  "Defines a fit — counts toward the score";
export const ICP_SECONDARY_TIER_HEADER =
  "Good to know — never counts against a company";
export const ICP_MANDATORY_EXPLANATION =
  "A confirmed failure disqualifies the company outright. An unknown does not.";

export function logIcpCriterionTierAssignments(
  assignments: IcpCriterionTierAssignment[],
  write: (line: string) => void = console.info,
): void {
  for (const assignment of assignments) {
    write(
      `icp_criterion_tier_backfill id=${assignment.id ?? "(new)"} name=${assignment.name} type=${assignment.criterionType} evidenceClass=${assignment.evidenceClass} tier=${assignment.tier} isMandatory=false reason=${assignment.reason}`,
    );
  }
}
