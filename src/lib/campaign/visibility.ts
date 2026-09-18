/**
 * Campaign visibility / shared-campaign authorization helpers.
 */

export const CAMPAIGN_LIST_VIEW_MY = "MY" as const;
export const CAMPAIGN_LIST_VIEW_SHARED_ALL = "SHARED_ALL" as const;

export type CampaignListViewMode =
  | typeof CAMPAIGN_LIST_VIEW_MY
  | typeof CAMPAIGN_LIST_VIEW_SHARED_ALL;

/** @deprecated Prefer CampaignListViewMode */
export type CampaignListView = CampaignListViewMode;

export type CampaignVisibilityRow = {
  ownerUserId: string;
  visibility: "PERSONAL" | "SHARED";
};

export function parseCampaignListViewMode(
  raw: string | null | undefined,
): CampaignListViewMode {
  if (raw === CAMPAIGN_LIST_VIEW_SHARED_ALL) return CAMPAIGN_LIST_VIEW_SHARED_ALL;
  if (raw === "ALL_SHARED") return CAMPAIGN_LIST_VIEW_SHARED_ALL;
  return CAMPAIGN_LIST_VIEW_MY;
}

export function canSetCampaignShared(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Aliases used by campaign UI and authorization. */
export const canSetShared = canSetCampaignShared;
export const canViewAllCampaigns = canSetCampaignShared;

/**
 * Open campaign detail by URL.
 * MEMBER may open their own campaign or a SHARED template.
 * Not another member's PERSONAL campaign.
 */
export function canOpenCampaignDetail(input: {
  role: string;
  userId: string;
  campaign: CampaignVisibilityRow;
}): boolean {
  if (canViewAllCampaigns(input.role)) return true;
  if (input.campaign.ownerUserId === input.userId) return true;
  if (input.campaign.visibility === "SHARED") return true;
  return false;
}

/** Template fields (product, ICP, persona, offer, length, guidance). */
export function canEditCampaignTemplate(input: {
  role: string;
  userId: string;
  campaign: CampaignVisibilityRow;
}): boolean {
  return input.campaign.ownerUserId === input.userId;
}

export function shouldShowUseThisCampaign(input: {
  userId: string;
  campaign: CampaignVisibilityRow;
}): boolean {
  return (
    input.campaign.visibility === "SHARED" &&
    input.campaign.ownerUserId !== input.userId
  );
}

/** Alias used by campaigns list page. */
export function shouldUseSharedCampaign(input: {
  userId: string;
  campaign: CampaignVisibilityRow;
}): boolean {
  return shouldShowUseThisCampaign(input);
}

export function campaignMatchesAllSharedView(
  campaign: CampaignVisibilityRow,
): boolean {
  return campaign.visibility === "SHARED";
}
