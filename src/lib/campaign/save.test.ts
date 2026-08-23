/**
 * Campaign save parsing + action/UI seam tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseCampaignFormData,
  toSafeCampaignActionError,
} from "@/lib/campaign/save";
import { TenantError } from "@/lib/tenant/errors";

function formFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("parseCampaignFormData", () => {
  it("accepts a valid payload", () => {
    const parsed = parseCampaignFormData(
      formFrom({
        name: "Q1 Outreach",
        productId: "prod_1",
        icpId: "icp_1",
        personaId: "persona_1",
      }),
    );
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields.name).toBe("Q1 Outreach");
    expect(parsed.contactIds).toEqual([]);
  });

  it("collects field errors when required fields are missing", () => {
    const parsed = parseCampaignFormData(
      formFrom({ name: "X", productId: "prod_1" }),
    );
    expect(parsed.fieldErrors.icpId).toBe("ICP is required.");
    expect(parsed.fieldErrors.personaId).toBe("Persona is required.");
  });
});

describe("toSafeCampaignActionError", () => {
  it("surfaces TenantError messages", () => {
    expect(
      toSafeCampaignActionError(
        new TenantError("ICP does not belong to the selected product."),
      ),
    ).toBe("ICP does not belong to the selected product.");
  });
});

describe("campaign save UI seam", () => {
  it("wires useActionState result into visible status", () => {
    const formSrc = readFileSync("src/components/NewCampaignForm.tsx", "utf8");
    const scoreReport = readFileSync("src/components/ScoreReportClient.tsx", "utf8");
    const actionsSrc = readFileSync("src/app/actions.ts", "utf8");

    expect(actionsSrc).toMatch(
      /export async function createCampaignAction\([\s\S]*Promise<CampaignActionResult>/,
    );
    expect(formSrc).toContain("useActionState");
    expect(formSrc).toContain('data-testid="campaign-action-status"');
    expect(scoreReport).toContain("useActionState");
    expect(scoreReport).toContain('data-testid="campaign-action-status"');
  });
});
