import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CampaignSummaryCard } from "@/components/CampaignSummaryCard";
import { buildCampaignStages, resolveCampaignStage } from "@/lib/workflow/campaign-stages";
import { formatDate } from "@/lib/utils";

describe("campaign summary cards", () => {
  it("renders the same card on Home and Campaigns, including product and created date", () => {
    const home = readFileSync("src/app/(app)/page.tsx", "utf8");
    const campaigns = readFileSync("src/app/(app)/campaigns/page.tsx", "utf8");
    const card = readFileSync("src/components/CampaignSummaryCard.tsx", "utf8");
    expect(home).toContain("<CampaignSummaryCard");
    expect(campaigns).toContain("<CampaignSummaryCard");
    expect(home).not.toContain("<table");
    expect(campaigns).not.toContain("<table");
    expect(card).toContain(">Product<");
    expect(card).toContain(">Created<");

    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: false,
      companyResultCount: 0,
      survivingCompanyCount: 0,
      qualifiedContactCount: 0,
      generatedEmailCount: 0,
      sentEmailCount: 0,
      dueContactCount: 0,
    });
    const html = renderToStaticMarkup(
      createElement(CampaignSummaryCard, {
        campaign: {
          id: "camp_1",
          name: "Spring Push",
          archived: false,
          context: "Mid-market · Operator",
          companies: 4,
          qualified: 3,
          contacts: 6,
          emailsToWrite: 2,
          stages,
          currentStage: resolveCampaignStage(undefined, stages),
          productName: "Forecast",
          createdAt: "2026-03-01T15:00:00.000Z",
          visibility: "PERSONAL",
          ownerUserId: "user_1",
          ownerLabel: "Alex",
        },
      }),
    );
    expect(html).toContain("Spring Push");
    expect(html).toContain("Forecast");
    expect(html).toContain(formatDate("2026-03-01T15:00:00.000Z"));
    expect(html).toContain('data-testid="home-campaign-stages-camp_1"');
    expect(html).toContain("click where you left off to continue.");
    expect(html.indexOf("Product")).toBeGreaterThan(-1);
    expect(html.indexOf("Created")).toBeGreaterThan(html.indexOf("Product"));
  });

  it("keeps campaign list controls and the Edit action", () => {
    const campaigns = readFileSync("src/app/(app)/campaigns/page.tsx", "utf8");
    expect(campaigns).toContain("My Campaigns");
    expect(campaigns).toContain("All org campaigns");
    expect(campaigns).toContain("ShowArchivedToggle");
    expect(campaigns).toContain("New campaign");
    expect(campaigns).toContain("Edit");
    expect(campaigns).toContain("SharedCampaignActions");
    expect(campaigns).toContain("listView: effectiveView");
    expect(campaigns).toContain('href={`/campaigns/${campaign.id}`}');
  });
});
