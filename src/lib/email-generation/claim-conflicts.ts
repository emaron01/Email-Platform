import type { ClaimValidationViolation } from "@/lib/email-generation/claim-validation-contract";

export type { ClaimValidationViolation };

export function claimConflictsFromJson(
  value: unknown,
): ClaimValidationViolation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ClaimValidationViolation => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const candidate = entry as Partial<ClaimValidationViolation>;
    return (
      typeof candidate.type === "string" &&
      typeof candidate.description === "string"
    );
  });
}

export function claimConflictsBlockSend(input: {
  claimConflictsJson: unknown;
  claimConflictsAcknowledgedAt: Date | null;
}): boolean {
  const conflicts = claimConflictsFromJson(input.claimConflictsJson);
  if (conflicts.length === 0) return false;
  return input.claimConflictsAcknowledgedAt == null;
}

/** Map claim-guard violations into AiValidationIssue-shaped records for UsageEvent. */
export function claimViolationsToIssues(
  violations: ClaimValidationViolation[],
): Array<{
  path: string;
  code: string;
  expected?: string;
  matchedGuard?: string | null;
  bodyExcerpt?: string | null;
}> {
  return violations.map((violation) => ({
    path: violation.bodyExcerpt
      ? `body:${violation.bodyExcerpt.slice(0, 80)}`
      : "body",
    code: violation.type,
    expected: violation.description,
    matchedGuard: violation.matchedGuard,
    bodyExcerpt: violation.bodyExcerpt,
  }));
}

export function isClaimGuardViolationCode(code: string | undefined): boolean {
  return (
    code === "PROHIBITED_CLAIM" ||
    code === "PROHIBITED_TERM" ||
    code === "INVENTED_OFFER_TERM" ||
    code === "UNSUPPORTED_FACT"
  );
}
