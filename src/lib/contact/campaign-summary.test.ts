import { describe, expect, it } from "vitest";
import {
  countConfirmedSends,
  formatContactCampaignLine,
  resolveContactCampaignQualification,
} from "@/lib/contact/campaign-summary";

describe("campaign-summary", () => {
  it("formats ready-to-include lines with persona and send count", () => {
    expect(
      formatContactCampaignLine({
        campaignName: "Test",
        bucket: "GOOD",
        statusDetail: "VP of Sales",
        sentCount: 1,
      }),
    ).toBe("Test · Ready to include · VP of Sales · 1 sent");
  });

  it("formats left-out lines with exclusion detail", () => {
    expect(
      formatContactCampaignLine({
        campaignName: "Q3 push",
        bucket: "EXCLUDED",
        statusDetail: "revenue below range",
        sentCount: 0,
      }),
    ).toBe("Q3 push · Left out, revenue below range · 0 sent");
  });

  it("formats check-before-including with reason", () => {
    expect(
      formatContactCampaignLine({
        campaignName: "Fall",
        bucket: "NEEDS_REVIEW",
        statusDetail: "Title did not match a selected persona",
        sentCount: 0,
      }),
    ).toBe(
      "Fall · Check before including, Title did not match a selected persona · 0 sent",
    );
  });

  it("shows not scored when campaign membership has no compatible score", () => {
    expect(
      formatContactCampaignLine({
        campaignName: "New campaign",
        bucket: null,
        statusDetail: null,
        sentCount: 0,
      }),
    ).toBe("New campaign · Not scored for this campaign · 0 sent");
  });

  it("counts only confirmed SENT drafts", () => {
    expect(
      countConfirmedSends([
        { status: "DRAFT" },
        { status: "SENT" },
        { status: "SENT" },
        { status: "SENDING" },
      ]),
    ).toBe(2);
  });

  it("resolves persona name for good fits", () => {
    const result = resolveContactCampaignQualification({
      scoringStatus: "COMPLETED",
      scoreLabel: "GOOD",
      assessmentData: {
        qualificationBucket: "GOOD",
        qualificationReason: "Matched persona: VP of Sales.",
      },
      criterionAssessments: [],
      matchedPersonaName: "VP of Sales",
      overrideBucket: null,
    });
    expect(result.bucket).toBe("GOOD");
    expect(result.statusDetail).toBe("VP of Sales");
  });
});
