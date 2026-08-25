/**
 * Campaign persona-in-play selection.
 * Empty in-play list means every persona for the product (the default).
 * Campaign.personaId is a legacy single-persona fallback only.
 */

export const ALL_CAMPAIGN_PERSONAS_VALUE = "__all__";

export type CampaignPersonaSelection = {
  /** Legacy single-persona fallback; null when the campaign uses all personas. */
  personaId: string | null;
  /** Explicit subset. Empty means all product personas. */
  personaIds: string[];
  allPersonas: boolean;
};

export function parseCampaignPersonaSelection(
  formData: FormData,
): CampaignPersonaSelection {
  const allFlag = String(formData.get("allPersonas") ?? "")
    .trim()
    .toLowerCase();
  const rawIds = formData
    .getAll("personaIds")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((id) => id !== ALL_CAMPAIGN_PERSONAS_VALUE);
  const fallback = String(formData.get("personaId") ?? "").trim();
  if (fallback && fallback !== ALL_CAMPAIGN_PERSONAS_VALUE) {
    rawIds.push(fallback);
  }
  const uniqueIds = Array.from(new Set(rawIds));
  const allPersonas =
    allFlag === "1" ||
    allFlag === "true" ||
    allFlag === "on" ||
    uniqueIds.length === 0;
  if (allPersonas) {
    return { personaId: null, personaIds: [], allPersonas: true };
  }
  return {
    personaId: uniqueIds.length === 1 ? uniqueIds[0]! : null,
    personaIds: uniqueIds,
    allPersonas: false,
  };
}

export function campaignPersonasDisplayName(input: {
  fallbackPersonaName?: string | null;
  inPlayNames: string[];
  productPersonaCount: number;
}): string {
  if (input.inPlayNames.length > 0) {
    if (
      input.productPersonaCount > 0 &&
      input.inPlayNames.length >= input.productPersonaCount
    ) {
      return "All personas";
    }
    return input.inPlayNames.join(", ");
  }
  if (input.fallbackPersonaName?.trim()) return input.fallbackPersonaName.trim();
  return "All personas";
}

/** Resolve which persona ids a campaign will email. */
export function resolveCampaignPersonaIds(input: {
  fallbackPersonaId: string | null;
  inPlayPersonaIds: string[];
  productPersonaIds: string[];
}): string[] {
  if (input.inPlayPersonaIds.length > 0) {
    return input.inPlayPersonaIds.filter((id) =>
      input.productPersonaIds.includes(id),
    );
  }
  if (input.fallbackPersonaId) return [input.fallbackPersonaId];
  return [...input.productPersonaIds];
}
