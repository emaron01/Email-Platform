import { describe, expect, it } from "vitest";
import {
  canEditCampaignTemplate,
  canOpenCampaignDetail,
  canSetCampaignShared,
  parseCampaignListViewMode,
  shouldUseSharedCampaign,
  CAMPAIGN_LIST_VIEW_MY,
  CAMPAIGN_LIST_VIEW_SHARED_ALL,
} from "@/lib/campaign/visibility";

describe("campaign visibility", () => {
  it("parses list view modes", () => {
    expect(parseCampaignListViewMode(undefined)).toBe(CAMPAIGN_LIST_VIEW_MY);
    expect(parseCampaignListViewMode("SHARED_ALL")).toBe(
      CAMPAIGN_LIST_VIEW_SHARED_ALL,
    );
  });

  it("only OWNER/ADMIN can share", () => {
    expect(canSetCampaignShared("OWNER")).toBe(true);
    expect(canSetCampaignShared("ADMIN")).toBe(true);
    expect(canSetCampaignShared("MEMBER")).toBe(false);
  });

  it("blocks template edits for non-owner on SHARED", () => {
    expect(
      canEditCampaignTemplate({
        role: "MEMBER",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(false);
    expect(
      canEditCampaignTemplate({
        role: "ADMIN",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(true);
    expect(
      shouldUseSharedCampaign({
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(true);
  });

  it("blocks opening another member's PERSONAL campaign by URL", () => {
    expect(
      canOpenCampaignDetail({
        role: "MEMBER",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "PERSONAL" },
      }),
    ).toBe(false);
    expect(
      canOpenCampaignDetail({
        role: "MEMBER",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(true);
    expect(
      canOpenCampaignDetail({
        role: "ADMIN",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "PERSONAL" },
      }),
    ).toBe(true);
  });
});
