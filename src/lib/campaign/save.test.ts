/**
 * Campaign save parsing + action/UI seam tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  EMAIL_GUIDANCE_MAX_CHARS,
  parseCampaignEmailSettingsFormData,
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
    expect(parsed.fields.personaId).toBe("persona_1");
    expect(parsed.fields.personaIds).toEqual(["persona_1"]);
    expect(parsed.fields.emailLength).toBe("MEDIUM");
    expect(parsed.fields.emailGuidance).toBeNull();
    expect(parsed.contactIds).toEqual([]);
  });

  it("collects field errors when required fields are missing", () => {
    const parsed = parseCampaignFormData(
      formFrom({ name: "X", productId: "prod_1" }),
    );
    expect(parsed.fieldErrors.icpId).toBe("ICP is required.");
    expect(parsed.fieldErrors.personaId).toBeUndefined();
    expect(parsed.fields.personaId).toBeNull();
    expect(parsed.fields.personaIds).toEqual([]);
  });

  it("treats omitted personas as all personas for the product", () => {
    const parsed = parseCampaignFormData(
      formFrom({
        name: "Q1 Outreach",
        productId: "prod_1",
        icpId: "icp_1",
        allPersonas: "1",
      }),
    );
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields.personaId).toBeNull();
    expect(parsed.fields.personaIds).toEqual([]);
  });
});

describe("parseCampaignEmailSettingsFormData", () => {
  it("accepts a selected length and optional guidance", () => {
    const parsed = parseCampaignEmailSettingsFormData(
      formFrom({
        emailLength: "LONG",
        emailGuidance: " Emphasize the free trial. ",
      }),
    );

    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields).toEqual({
      emailLength: "LONG",
      emailGuidance: "Emphasize the free trial.",
    });
  });

  it("defaults missing length and stores empty guidance as null", () => {
    const parsed = parseCampaignEmailSettingsFormData(formFrom({}));
    expect(parsed.fields.emailLength).toBe("MEDIUM");
    expect(parsed.fields.emailGuidance).toBeNull();
  });

  it("rejects invalid lengths and guidance over 1500 characters", () => {
    const parsed = parseCampaignEmailSettingsFormData(
      formFrom({
        emailLength: "FIVE_PARAGRAPH",
        emailGuidance: "x".repeat(EMAIL_GUIDANCE_MAX_CHARS + 1),
      }),
    );

    expect(parsed.fieldErrors.emailLength).toMatch(/valid email length/i);
    expect(parsed.fieldErrors.emailGuidance).toMatch(
      /1500 characters or fewer/i,
    );
  });

  it("accepts email guidance of 1500 characters and rejects 1501", () => {
    expect(EMAIL_GUIDANCE_MAX_CHARS).toBe(1500);

    const accepted = parseCampaignEmailSettingsFormData(
      formFrom({
        emailLength: "SHORT",
        emailGuidance: "a".repeat(1500),
      }),
    );
    expect(accepted.fieldErrors).toEqual({});
    expect(accepted.fields.emailGuidance).toHaveLength(1500);

    const rejected = parseCampaignEmailSettingsFormData(
      formFrom({
        emailGuidance: "a".repeat(1501),
      }),
    );
    expect(rejected.fieldErrors.emailGuidance).toBe(
      "Email guidance must be 1500 characters or fewer.",
    );
    expect(rejected.fields.emailGuidance).toHaveLength(1501);
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
    const settingsForm = readFileSync(
      "src/components/CampaignEmailSettingsForm.tsx",
      "utf8",
    );
    const settingsAction = readFileSync(
      "src/app/actions/campaign-email-settings.ts",
      "utf8",
    );
    const detailPage = readFileSync(
      "src/app/(app)/campaigns/[id]/page.tsx",
      "utf8",
    );
    const actionsSrc = readFileSync("src/app/actions.ts", "utf8");

    expect(actionsSrc).toMatch(
      /export async function createCampaignAction\([\s\S]*Promise<CampaignActionResult>/,
    );
    expect(formSrc).toContain("useActionState");
    expect(formSrc).toContain('data-testid="campaign-action-status"');
    expect(scoreReport).toContain("useActionState");
    expect(scoreReport).toContain('data-testid="campaign-action-status"');
    expect(formSrc).toContain("Personas in play");
    expect(formSrc).toContain('name="personaIds"');
    expect(formSrc).toContain('name="allPersonas"');
    expect(scoreReport).toContain('name="allPersonas"');
    expect(scoreReport).not.toContain("Select persona for this campaign");
    expect(formSrc).toContain('name="emailGuidance"');
    expect(scoreReport).toContain('name="emailLength"');
    expect(scoreReport).toContain('name="emailGuidance"');
    expect(settingsForm).toContain("updateCampaignEmailSettingsAction");
    expect(settingsForm).toContain("campaign-email-settings-status");
    expect(settingsAction).toContain(
      "export async function updateCampaignEmailSettingsAction",
    );
    expect(detailPage).toContain("CampaignEmailSettingsForm");
    expect(detailPage).toContain("Campaign email settings");
    expect(detailPage).toContain('?stage=setup');
  });

  it("keeps email guidance at 1500 characters in every field", () => {
    expect(EMAIL_GUIDANCE_MAX_CHARS).toBe(1500);
    const files = [
      "src/components/CampaignEmailSettingsForm.tsx",
      "src/components/NewCampaignForm.tsx",
      "src/components/ScoreReportClient.tsx",
      "src/lib/campaign/settings.ts",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("EMAIL_GUIDANCE_MAX_CHARS");
      expect(src).not.toMatch(/up to 500 characters/);
      expect(src).not.toMatch(/maxLength=\{500\}/);
    }
  });

  it("puts one collapsed campaign offer under email guidance on Emails", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    const offerForm = readFileSync("src/components/CampaignOfferForm.tsx", "utf8");
    const settingsForm = readFileSync(
      "src/components/CampaignEmailSettingsForm.tsx",
      "utf8",
    );
    const offerAction = readFileSync("src/app/actions/campaign-offer.ts", "utf8");
    const setup = page.slice(
      page.indexOf('currentStage === "setup"'),
      page.indexOf('currentStage === "emails"'),
    );
    const emails = page.slice(
      page.indexOf('currentStage === "emails"'),
      page.indexOf('currentStage === "list"'),
    );
    const detailsAt = offerForm.indexOf('data-testid="emails-campaign-offer"');
    const detailsTag = offerForm.slice(detailsAt - 40, detailsAt + 80);

    expect(page.match(/campaignOfferView\(/g)).toHaveLength(1);
    expect(setup).toContain("<CampaignOfferForm");
    expect(setup).toContain("offer={offer}");
    expect(setup).not.toContain("CollapsibleCampaignOffer");
    expect(emails).toContain("belowGuidance");
    expect(emails).toContain("<CollapsibleCampaignOffer");
    expect(emails.match(/offer=\{offer\}/g)?.length).toBe(3);
    expect(settingsForm.indexOf("{belowGuidance}")).toBeGreaterThan(
      settingsForm.indexOf('name="emailGuidance"'),
    );
    expect(detailsTag).toContain("<details");
    expect(detailsTag).not.toMatch(/\sopen(?:\s|=|>|$)/);
    expect(offerForm).toContain('label="Offer Name"');
    expect(offerForm).toContain('label="Primary CTA"');
    expect(offerForm).toContain('label="Offer Description"');
    expect(offerForm).toContain('label="Offer Notes"');
    expect(offerForm).toContain("Save offer");
    expect(offerForm).toContain("updateCampaignOfferAction");
    expect(offerForm).toContain("showContinueToList={false}");
    expect(offerAction.match(/updateCampaignOffer\(/g)).toHaveLength(1);
  });
});
