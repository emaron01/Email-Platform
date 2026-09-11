import { describe, expect, it } from "vitest";
import {
  campaignReturnFromScoringHref,
  scoringRunDisplayName,
  scoringRunHref,
  scoringRunLabelForCampaign,
} from "@/lib/lists/campaign-query";

describe("campaign scoring round-trip URLs", () => {
  it("keeps campaign on the scoring run URL", () => {
    expect(scoringRunHref("run_1")).toBe("/scoring/run_1");
    expect(scoringRunHref("run_1", "camp_1")).toBe(
      "/scoring/run_1?campaign=camp_1",
    );
  });

  it("returns to list stage with the scored run preselected", () => {
    expect(campaignReturnFromScoringHref("camp_1", "run_9")).toBe(
      "/campaigns/camp_1?stage=list&scoringRun=run_9",
    );
  });

  it("names campaign-triggered runs with campaign · list", () => {
    expect(scoringRunLabelForCampaign("Spring Push", "Inbound MQLs")).toBe(
      "Spring Push · Inbound MQLs",
    );
    expect(
      scoringRunDisplayName({
        label: "Spring Push · Inbound MQLs",
        contactList: { name: "Inbound MQLs" },
      }),
    ).toBe("Spring Push · Inbound MQLs");
    expect(
      scoringRunDisplayName({
        label: null,
        contactList: { name: "Inbound MQLs" },
      }),
    ).toBe("Inbound MQLs");
  });
});
