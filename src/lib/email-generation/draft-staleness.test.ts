import { describe, expect, it } from "vitest";
import {
  emailDraftStaleness,
  formatDraftStalenessMessage,
} from "@/lib/email-generation/draft-staleness";

describe("emailDraftStaleness", () => {
  const draftCreatedAt = "2026-08-15T12:00:00.000Z";
  const older = "2026-08-10T12:00:00.000Z";
  const newer = "2026-08-20T12:00:00.000Z";

  it("flags stale drafts when product changed after generation", () => {
    expect(
      emailDraftStaleness({
        draftCreatedAt,
        draftStatus: "DRAFT",
        productUpdatedAt: newer,
        personaUpdatedAt: older,
        companyResearchUpdatedAt: older,
      }),
    ).toEqual({ stale: true, reasons: ["product"] });
  });

  it("does not flag sent drafts", () => {
    expect(
      emailDraftStaleness({
        draftCreatedAt,
        draftStatus: "SENT",
        productUpdatedAt: newer,
        personaUpdatedAt: newer,
        companyResearchUpdatedAt: newer,
      }).stale,
    ).toBe(false);
  });

  it("combines multiple stale sources", () => {
    expect(
      emailDraftStaleness({
        draftCreatedAt,
        draftStatus: "APPROVED",
        productUpdatedAt: newer,
        personaUpdatedAt: newer,
        companyResearchUpdatedAt: null,
      }).reasons,
    ).toEqual(["product", "persona"]);
  });
});

describe("formatDraftStalenessMessage", () => {
  it("formats a readable regeneration hint", () => {
    expect(formatDraftStalenessMessage(["product"])).toContain(
      "before the product changed",
    );
    expect(
      formatDraftStalenessMessage(["product", "persona"]),
    ).toContain("product and persona");
  });
});
