import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  campaignListScoreButtonLabel,
  campaignListStageHref,
  isContactListResearchComplete,
  listDetailHref,
  listIndexHref,
  listScoreHref,
  parseCampaignId,
} from "@/lib/lists/campaign-query";

describe("campaign list selection query", () => {
  it("parses campaign ids and builds list hrefs", () => {
    expect(parseCampaignId(undefined)).toBeNull();
    expect(parseCampaignId("  ")).toBeNull();
    expect(parseCampaignId("camp_1")).toBe("camp_1");
    expect(listIndexHref()).toBe("/lists");
    expect(listIndexHref({ campaignId: "camp_1" })).toBe(
      "/lists?campaign=camp_1",
    );
    expect(listIndexHref({ campaignId: "camp_1", archived: true })).toBe(
      "/lists?campaign=camp_1&archived=1",
    );
    expect(listDetailHref("list_1")).toBe("/lists/list_1");
    expect(listDetailHref("list_1", { campaignId: "camp_1", page: 2 })).toBe(
      "/lists/list_1?campaign=camp_1&page=2",
    );
    expect(listScoreHref("list_1")).toBe("/lists/list_1/score");
    expect(listScoreHref("list_1", "camp_1")).toBe(
      "/lists/list_1/score?campaign=camp_1",
    );
    expect(campaignListStageHref("camp_1")).toBe(
      "/campaigns/camp_1?stage=list",
    );
  });

  it("treats a list as researched when every company is covered", () => {
    expect(
      isContactListResearchComplete({
        uniqueCompanies: 31,
        needingResearch: 0,
      }),
    ).toBe(true);
    expect(
      isContactListResearchComplete({
        uniqueCompanies: 31,
        needingResearch: 2,
      }),
    ).toBe(false);
    expect(
      isContactListResearchComplete({
        uniqueCompanies: 0,
        needingResearch: 0,
      }),
    ).toBe(false);
  });

  it("renames Score List to include the campaign only after research is done", () => {
    expect(campaignListScoreButtonLabel("Q4 Outreach", false)).toBe(
      "Score List",
    );
    expect(campaignListScoreButtonLabel("Q4 Outreach", true)).toBe(
      "Score List for Q4 Outreach",
    );
  });

  it("only shows research-then-score header actions when a campaign selected the list", () => {
    const manager = readFileSync(
      "src/components/CampaignContactsManager.tsx",
      "utf8",
    );
    const listPage = readFileSync("src/app/(app)/lists/page.tsx", "utf8");
    const listDetail = readFileSync(
      "src/app/(app)/lists/[id]/page.tsx",
      "utf8",
    );
    const workflow = readFileSync(
      "src/components/CampaignListWorkflowButtons.tsx",
      "utf8",
    );

    expect(manager).toContain("listIndexHref({ campaignId })");
    expect(listPage).toContain("parseCampaignId");
    expect(listPage).toContain("listDetailHref(list.id");
    expect(listDetail).toContain("CampaignListWorkflowButtons");
    expect(listDetail).toContain("isContactListResearchComplete");
    expect(workflow).toContain("Research Companies");
    expect(workflow).toContain("campaignListScoreButtonLabel");
    expect(workflow).toContain("bg-emerald-600");
    expect(workflow).toContain("campaign-list-research-button");
    expect(workflow).toContain("Research companies on this list first");
  });
});
