export function parseCampaignId(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = raw?.trim() ?? "";
  return id.length > 0 ? id : null;
}

export function listIndexHref(input?: {
  campaignId?: string | null;
  archived?: boolean;
}): string {
  const params = new URLSearchParams();
  if (input?.campaignId) params.set("campaign", input.campaignId);
  if (input?.archived) params.set("archived", "1");
  const qs = params.toString();
  return qs ? `/lists?${qs}` : "/lists";
}

export function listDetailHref(
  listId: string,
  input?: { campaignId?: string | null; page?: number },
): string {
  const params = new URLSearchParams();
  if (input?.campaignId) params.set("campaign", input.campaignId);
  if (input?.page && input.page > 1) params.set("page", String(input.page));
  const qs = params.toString();
  return qs ? `/lists/${listId}?${qs}` : `/lists/${listId}`;
}

export function listScoreHref(
  listId: string,
  campaignId?: string | null,
): string {
  if (!campaignId) return `/lists/${listId}/score`;
  const params = new URLSearchParams({ campaign: campaignId });
  return `/lists/${listId}/score?${params.toString()}`;
}

export function scoringRunHref(
  runId: string,
  campaignId?: string | null,
): string {
  if (!campaignId) return `/scoring/${runId}`;
  const params = new URLSearchParams({ campaign: campaignId });
  return `/scoring/${runId}?${params.toString()}`;
}

/** Return to campaign List stage with the scored run pre-selected. */
export function campaignReturnFromScoringHref(
  campaignId: string,
  scoringRunId: string,
): string {
  const params = new URLSearchParams({
    stage: "list",
    scoringRun: scoringRunId,
  });
  return `/campaigns/${campaignId}?${params.toString()}`;
}

export function campaignListStageHref(campaignId: string): string {
  return `/campaigns/${campaignId}?stage=list`;
}

/** Prefer campaign-aware label when present. */
export function scoringRunDisplayName(run: {
  label?: string | null;
  contactList?: { name: string } | null;
  listName?: string | null;
}): string {
  const label = run.label?.trim();
  if (label) return label;
  return run.contactList?.name?.trim() || run.listName?.trim() || "Scoring run";
}

export function scoringRunLabelForCampaign(
  campaignName: string,
  listName: string,
): string {
  return `${campaignName.trim()} · ${listName.trim()}`;
}

export function isContactListResearchComplete(plan: {
  uniqueCompanies: number;
  needingResearch: number;
}): boolean {
  return plan.uniqueCompanies > 0 && plan.needingResearch === 0;
}

export function campaignListScoreButtonLabel(
  campaignName: string,
  researchComplete: boolean,
): string {
  return researchComplete ? `Score List for ${campaignName}` : "Score List";
}
