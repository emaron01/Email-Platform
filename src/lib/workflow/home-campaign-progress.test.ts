import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignStageRail } from "@/components/CampaignStageRail";
import { DueContactsPanel } from "@/components/DueContactsPanel";
import { HomeCampaignStages } from "@/components/HomeCampaignStages";
import { Sidebar } from "@/components/Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns/camp_1",
}));
import type { CampaignDueSummary } from "@/lib/cadence/dashboard";
import {
  buildCampaignStages,
  campaignStageMarker,
  resolveCampaignStage,
} from "@/lib/workflow/campaign-stages";

describe("home campaign progress", () => {
  it("shows the same stage markers as the rail and side nav, and each marker opens that stage", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 1,
      survivingCompanyCount: 1,
      qualifiedContactCount: 1,
      generatedEmailCount: 0,
      sentEmailCount: 0,
      dueContactCount: 0,
    });
    const currentStage = resolveCampaignStage(undefined, stages);
    const html = renderToStaticMarkup(
      createElement(HomeCampaignStages, {
        campaignId: "camp_1",
        stages,
        currentStage,
      }),
    );

    expect(html).toContain(
      "Click the campaign name, or red stage, to pick-up where you left off to continue.",
    );
    expect(html).toContain('data-testid="home-campaign-stages-camp_1"');
    for (const stage of stages) {
      const marker = campaignStageMarker(stage, currentStage);
      expect(html).toContain(marker.className);
      if (stage.available) {
        expect(html).toContain(
          `href="/campaigns/camp_1?stage=${stage.key}"`,
        );
      }
    }
    expect(html).toContain("bg-emerald-600 text-white");
    expect(html).toContain("bg-red-600 text-white");

    const home = readFileSync("src/lib/workflow/home.ts", "utf8");
    const rail = readFileSync("src/components/CampaignStageRail.tsx", "utf8");
    const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
    const markers = readFileSync(
      "src/components/HomeCampaignStages.tsx",
      "utf8",
    );
    expect(home).toContain("deriveCampaignProgress");
    expect(rail).toContain("campaignStageMarker");
    expect(rail).toContain("resolveCampaignStage(undefined, stages)");
    expect(sidebar).toContain("campaignStageMarker");
    expect(sidebar).toContain("resolveCampaignStage(");
    expect(markers).toContain("campaignStageMarker");
    expect(markers).toContain("resolveCampaignStage(undefined, stages)");

    const page = readFileSync("src/app/(app)/page.tsx", "utf8");
    const setupAt = page.indexOf("<HomeSetupRail");
    const campaignsAt = page.indexOf("workflow.campaigns.map");
    const dueAt = page.indexOf("<DueContactsPanel");
    expect(setupAt).toBeGreaterThan(-1);
    expect(dueAt).toBeGreaterThan(setupAt);
    expect(campaignsAt).toBeGreaterThan(dueAt);
  });

  it("keeps Emails red on the setup tracker when nothing has been sent", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 1,
      survivingCompanyCount: 1,
      qualifiedContactCount: 1,
      generatedEmailCount: 2,
      sentEmailCount: 0,
      dueContactCount: 0,
    });
    const surfaces = [
      renderToStaticMarkup(
        createElement(HomeCampaignStages, {
          campaignId: "camp_1",
          stages,
          currentStage: "setup",
        }),
      ),
      renderToStaticMarkup(
        createElement(CampaignStageRail, {
          campaignId: "camp_1",
          stages,
          currentStage: "setup",
        }),
      ),
      renderToStaticMarkup(
        createElement(Sidebar, {
          items: [],
          campaign: {
            campaignId: "camp_1",
            stages,
            currentStage: "setup",
          },
        }),
      ),
    ];
    for (const html of surfaces) {
      expect(html).toContain('bg-red-600 text-white">8');
      expect(html).toContain('bg-emerald-600 text-white">✓');
      expect(html).toContain('bg-slate-200 text-slate-600">9');
    }
    const rail = surfaces[1];
    const setupAt = rail.indexOf("stage=setup");
    const emailsAt = rail.indexOf("stage=emails");
    expect(rail.slice(setupAt - 200, setupAt)).toContain('aria-current="step"');
    expect(rail.slice(emailsAt - 200, emailsAt)).not.toContain(
      'aria-current="step"',
    );
  });

  it("renders overdue emails as one collapsed section per campaign", () => {
    const dueByCampaign: CampaignDueSummary[] = [
      {
        campaignId: "camp_1",
        campaignName: "Spring Push",
        overdue: 2,
        today: 1,
        thisWeek: 0,
        dueContacts: [
          {
            campaignContactId: "cc_overdue",
            campaignId: "camp_1",
            campaignName: "Spring Push",
            contactId: "contact_1",
            contactName: "Ada Lovelace",
            contactEmail: "ada@example.com",
            company: "Analytical",
            nextDueAt: new Date("2026-05-01T12:00:00.000Z"),
            urgency: "overdue",
            sentCount: 1,
            nextSequenceNumber: 2,
            hasDraft: false,
          },
          {
            campaignContactId: "cc_today",
            campaignId: "camp_1",
            campaignName: "Spring Push",
            contactId: "contact_2",
            contactName: "Grace Hopper",
            contactEmail: "grace@example.com",
            company: "Analytical",
            nextDueAt: new Date("2026-06-01T12:00:00.000Z"),
            urgency: "today",
            sentCount: 0,
            nextSequenceNumber: 1,
            hasDraft: true,
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(
      createElement(DueContactsPanel, { dueByCampaign }),
    );
    expect(html).toContain('data-testid="due-campaign-camp_1"');
    expect(html).not.toMatch(/<details[^>]*\sopen[\s>]/);
    expect(html).toContain("Spring Push");
    expect(html).toContain("2 overdue");
    expect(html).toContain("Ada Lovelace");
    const details = html.slice(
      html.indexOf('data-testid="due-campaign-camp_1"'),
    );
    expect(details.indexOf("Ada Lovelace")).toBeGreaterThan(
      details.indexOf("2 overdue"),
    );
  });
});
