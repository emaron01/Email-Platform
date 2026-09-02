export type DraftStalenessInput = {
  draftCreatedAt: string;
  draftStatus: string;
  productUpdatedAt: string;
  personaUpdatedAt: string | null;
  companyResearchUpdatedAt: string | null;
};

const SENT_STATUSES = new Set(["SENT", "SKIPPED"]);

function isAfter(left: string, right: string): boolean {
  return new Date(left).getTime() > new Date(right).getTime();
}

export function emailDraftStaleness(
  input: DraftStalenessInput,
): { stale: boolean; reasons: string[] } {
  if (SENT_STATUSES.has(input.draftStatus)) {
    return { stale: false, reasons: [] };
  }

  const reasons: string[] = [];
  if (isAfter(input.productUpdatedAt, input.draftCreatedAt)) {
    reasons.push("product");
  }
  if (
    input.personaUpdatedAt &&
    isAfter(input.personaUpdatedAt, input.draftCreatedAt)
  ) {
    reasons.push("persona");
  }
  if (
    input.companyResearchUpdatedAt &&
    isAfter(input.companyResearchUpdatedAt, input.draftCreatedAt)
  ) {
    reasons.push("company research");
  }

  return { stale: reasons.length > 0, reasons };
}

export function formatDraftStalenessMessage(reasons: string[]): string {
  if (reasons.length === 0) return "";
  const label =
    reasons.length === 1
      ? reasons[0]!
      : `${reasons.slice(0, -1).join(", ")} and ${reasons.at(-1)}`;
  return `This draft was generated before the ${label} changed. Regenerate to reflect the update.`;
}
