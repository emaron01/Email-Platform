/**
 * Campaign visibility / shared-campaign authorization helpers.
 */

export const CAMPAIGN_LIST_VIEW_MY = "MY" as const;
export const CAMPAIGN_LIST_VIEW_SHARED_ALL = "SHARED_ALL" as const;
export const CAMPAIGN_LIST_VIEW_ALL_ACTIVITY = "ALL_ACTIVITY" as const;

export type CampaignListViewMode =
  | typeof CAMPAIGN_LIST_VIEW_MY
  | typeof CAMPAIGN_LIST_VIEW_SHARED_ALL
  | typeof CAMPAIGN_LIST_VIEW_ALL_ACTIVITY;

/** @deprecated Prefer CampaignListViewMode */
export type CampaignListView = CampaignListViewMode;

export type CampaignVisibilityRow = {
  ownerUserId: string | null;
  visibility: "PERSONAL" | "SHARED";
};

export function parseCampaignListViewMode(
  raw: string | null | undefined,
): CampaignListViewMode {
  if (raw === CAMPAIGN_LIST_VIEW_SHARED_ALL) return CAMPAIGN_LIST_VIEW_SHARED_ALL;
  if (raw === CAMPAIGN_LIST_VIEW_ALL_ACTIVITY) {
    return CAMPAIGN_LIST_VIEW_ALL_ACTIVITY;
  }
  if (raw === "ALL_SHARED") return CAMPAIGN_LIST_VIEW_SHARED_ALL;
  return CAMPAIGN_LIST_VIEW_MY;
}

export function canSetCampaignShared(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Alias used by campaign detail page. */
export const canSetShared = canSetCampaignShared;

export function canViewAllActivity(role: string): boolean {
  return canSetCampaignShared(role);
}

/**
 * Open campaign detail by URL.
 * MEMBER may open: own PERSONAL, SHARED (template/execution), legacy null-owner.
 * Not another member's PERSONAL campaign.
 */
export function canOpenCampaignDetail(input: {
  role: string;
  userId: string;
  campaign: CampaignVisibilityRow;
}): boolean {
  if (canViewAllActivity(input.role)) return true;
  if (input.campaign.ownerUserId == null) return true;
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
  if (input.campaign.visibility !== "SHARED") {
    return (
      input.campaign.ownerUserId == null ||
      input.campaign.ownerUserId === input.userId ||
      canSetCampaignShared(input.role)
    );
  }
  if (input.campaign.ownerUserId === input.userId) return true;
  return canSetCampaignShared(input.role);
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

export function campaignMatchesMyView(input: {
  userId: string;
  campaign: CampaignVisibilityRow;
  hasExecution: boolean;
}): boolean {
  if (input.campaign.ownerUserId === input.userId) return true;
  if (input.campaign.visibility === "SHARED" && input.hasExecution) return true;
  if (input.campaign.ownerUserId == null) return true;
  return false;
}

export function campaignMatchesAllSharedView(
  campaign: CampaignVisibilityRow,
): boolean {
  return campaign.visibility === "SHARED" || campaign.ownerUserId == null;
}
