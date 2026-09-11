import { describe, expect, it } from "vitest";
import {
  FUTURE_PREMIUM_SEAT_MAX,
  FUTURE_PREMIUM_SEAT_MIN,
  individualOrgAdminInviteBlockMessage,
  orgAdminInviteDenialReason,
  orgAdminInvitesAllowed,
} from "@/lib/org/seats";

describe("org seat / invite policy", () => {
  it("blocks org-admin invites on INDIVIDUAL Standard", () => {
    expect(
      orgAdminInvitesAllowed({
        accountType: "INDIVIDUAL",
        planCode: "STANDARD",
      }),
    ).toBe(false);
    expect(
      orgAdminInviteDenialReason({
        accountType: "INDIVIDUAL",
        planCode: "STANDARD",
      }),
    ).toContain("limited to one user");
    expect(individualOrgAdminInviteBlockMessage()).toContain(
      "Team accounts are coming soon",
    );
  });

  it("allows COMPED Individual and all ENTERPRISE", () => {
    expect(
      orgAdminInvitesAllowed({
        accountType: "INDIVIDUAL",
        planCode: "COMPED",
      }),
    ).toBe(true);
    expect(
      orgAdminInvitesAllowed({
        accountType: "INDIVIDUAL",
        planCode: "FREE",
      }),
    ).toBe(true);
    expect(
      orgAdminInvitesAllowed({
        accountType: "ENTERPRISE",
        planCode: "STANDARD",
      }),
    ).toBe(true);
    expect(
      orgAdminInviteDenialReason({
        accountType: "ENTERPRISE",
        planCode: "STANDARD",
      }),
    ).toBeNull();
  });

  it("reserves Premium seat bounds for later Stripe quantity work", () => {
    expect(FUTURE_PREMIUM_SEAT_MIN).toBe(2);
    expect(FUTURE_PREMIUM_SEAT_MAX).toBe(10);
  });

  it("gates org-admin createOrganizationInvitation and leaves platform path open", async () => {
    const { readFileSync } = await import("node:fs");
    const signup = readFileSync("src/lib/org/signup.ts", "utf8");
    expect(signup).toContain("orgAdminInviteDenialReason");
    expect(signup).toContain("createOrganizationInvitationAsPlatform");
    // Platform path must not call the org-admin denial helper.
    const platformFn = signup.slice(
      signup.indexOf("createOrganizationInvitationAsPlatform"),
      signup.indexOf("async function issueOrganizationInvitation"),
    );
    expect(platformFn).not.toContain("orgAdminInviteDenialReason");
  });
});
