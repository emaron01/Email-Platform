import { describe, expect, it } from "vitest";
import { getProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";

describe("getProductCampaignReadiness", () => {
  const complete = {
    approvalStatus: "APPROVED",
    icps: [{ criteria: [{ id: "c1" }] }],
    personas: [{ id: "p1" }],
  };

  it("marks a complete product as ready", () => {
    expect(getProductCampaignReadiness(complete)).toEqual({
      ready: true,
      blockers: [],
      omissionReason: null,
    });
  });

  it("requires approval", () => {
    const result = getProductCampaignReadiness({
      ...complete,
      approvalStatus: "NEEDS_REVIEW",
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("Product needs review and approval");
  });

  it("requires an ICP with criteria rows", () => {
    const result = getProductCampaignReadiness({
      ...complete,
      icps: [{ criteria: [] }],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("Needs an ICP with criteria");
  });

  it("requires at least one persona", () => {
    const result = getProductCampaignReadiness({
      ...complete,
      personas: [],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("Needs at least one saved persona");
  });

  it("lists every blocker when multiple are missing", () => {
    const result = getProductCampaignReadiness({
      approvalStatus: "DRAFT",
      icps: [],
      personas: [],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(3);
    expect(result.omissionReason).toContain("draft");
    expect(result.omissionReason).toContain("ICP");
    expect(result.omissionReason).toContain("persona");
  });
});
