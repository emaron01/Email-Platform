import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCampaignStages,
  campaignStageMarker,
  resolveCampaignStage,
} from "@/lib/workflow/campaign-stages";
import { deriveCampaignProgress } from "@/lib/workflow/campaign-progress";

const caughtUp = {
  setupComplete: true,
  hasListData: true,
  companyResultCount: 1,
  survivingCompanyCount: 1,
  qualifiedContactCount: 1,
  generatedEmailCount: 2,
  sentEmailCount: 1,
  dueContactCount: 0,
};

describe("emails stage follows who is due", () => {
  it("is red when a contact has an email due, and resume opens Emails", () => {
    const stages = buildCampaignStages({ ...caughtUp, dueContactCount: 2 });
    const emails = stages.find((stage) => stage.key === "emails");
    expect(emails?.completed).toBe(false);
    expect(campaignStageMarker(emails!, "emails")).toMatchObject({
      className: "bg-red-600 text-white",
      text: "8",
    });
    expect(resolveCampaignStage(undefined, stages)).toBe("emails");
  });

  it("is green when drafts exist and no contact is due", () => {
    const stages = buildCampaignStages(caughtUp);
    const emails = stages.find((stage) => stage.key === "emails");
    expect(emails?.completed).toBe(true);
    expect(campaignStageMarker(emails!, "report")).toMatchObject({
      className: "bg-emerald-600 text-white",
      text: "✓",
    });
    expect(resolveCampaignStage(undefined, stages)).toBe("report");
  });

  it("is red when the campaign has no drafts yet", () => {
    const stages = buildCampaignStages({
      ...caughtUp,
      generatedEmailCount: 0,
      sentEmailCount: 0,
      dueContactCount: 0,
    });
    const emails = stages.find((stage) => stage.key === "emails");
    expect(emails?.completed).toBe(false);
    expect(resolveCampaignStage(undefined, stages)).toBe("emails");
    expect(campaignStageMarker(emails!, "emails").className).toBe(
      "bg-red-600 text-white",
    );
  });

  it("keeps Emails incomplete when a loaded contact is due", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const progress = deriveCampaignProgress({
      productId: "product_1",
      icpId: "icp_1",
      now,
      contacts: [
        {
          status: "SELECTED",
          sequenceStoppedAt: null,
          nextDueAt: new Date("2026-05-01T12:00:00.000Z"),
          emailDrafts: [{ status: "SENT" }],
          contact: { id: "contact_1", company: "Acme", companyId: "company_1" },
        },
      ],
      companyRows: [
        { id: "company_1", name: "Acme", bucket: "GOOD", canOverride: true },
      ],
      contactRows: [
        { id: "contact_1", bucket: "GOOD", companyId: "company_1" },
      ],
    });
    expect(progress.dueContactCount).toBe(1);
    expect(progress.stages.find((stage) => stage.key === "emails")?.completed).toBe(
      false,
    );
    expect(resolveCampaignStage(undefined, progress.stages)).toBe("emails");
  });

  it("is green when every contact has finished the sequence", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const progress = deriveCampaignProgress({
      productId: "product_1",
      icpId: "icp_1",
      now,
      contacts: [
        {
          status: "SELECTED",
          sequenceStoppedAt: now,
          nextDueAt: null,
          emailDrafts: [
            { status: "SENT" },
            { status: "SENT" },
            { status: "SENT" },
            { status: "SENT" },
          ],
          contact: { id: "contact_1", company: "Acme", companyId: "company_1" },
        },
      ],
      companyRows: [
        {
          id: "company_1",
          name: "Acme",
          bucket: "GOOD",
          canOverride: true,
        },
      ],
      contactRows: [
        { id: "contact_1", bucket: "GOOD", companyId: "company_1" },
      ],
    });
    expect(progress.dueContactCount).toBe(0);
    expect(progress.stages.find((stage) => stage.key === "emails")?.completed).toBe(
      true,
    );
    expect(resolveCampaignStage(undefined, progress.stages)).toBe("report");
  });

  it("opens the first incomplete stage when the url does not name one", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 0,
      survivingCompanyCount: 0,
      qualifiedContactCount: 0,
      generatedEmailCount: 0,
      sentEmailCount: 0,
      dueContactCount: 0,
    });
    expect(stages.find((stage) => stage.key === "companies")?.completed).toBe(
      true,
    );
    expect(stages.find((stage) => stage.key === "contacts")?.completed).toBe(
      true,
    );
    expect(resolveCampaignStage(undefined, stages)).toBe("emails");
    expect(resolveCampaignStage("companies", stages)).toBe("companies");
    expect(resolveCampaignStage("contacts", stages)).toBe("contacts");
    expect(resolveCampaignStage("setup", stages)).toBe("setup");
  });
});

describe("campaign progress surfaces", () => {
  it("uses one marker and one progress function for the rail and the side nav", () => {
    const rail = readFileSync("src/components/CampaignStageRail.tsx", "utf8");
    const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    expect(rail).toContain("campaignStageMarker");
    expect(sidebar).toContain("campaignStageMarker");
    expect(sidebar).toContain("campaign-sidebar-stages");
    expect(shell).toContain("deriveCampaignProgress");
    expect(shell).toContain("resolveCampaignStage");
    expect(page).toContain("deriveCampaignProgress");
    expect(page).toContain("resolveCampaignStage");
    for (const key of [
      "setup",
      "list",
      "companies",
      "contacts",
      "emails",
      "report",
    ]) {
      expect(sidebar).toContain("`campaign-sidebar-stage-${stage.key}`");
      expect(readFileSync("src/lib/workflow/campaign-stages.ts", "utf8")).toContain(
        `"${key}"`,
      );
    }
  });
});
