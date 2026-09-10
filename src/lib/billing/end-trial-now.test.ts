import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("early trial conversion (trial_end: now)", () => {
  it("exposes POST /api/billing/end-trial and uses Stripe trial_end now", () => {
    const route = readFileSync("src/app/api/billing/end-trial/route.ts", "utf8");
    const lib = readFileSync("src/lib/billing/end-trial-now.ts", "utf8");

    expect(route).toContain("endTrialNow");
    expect(lib).toContain('trial_end: "now"');
    expect(lib).toContain("customerHasCardOnFile");
  });

  it("does not apply entitlements in the end-trial action (webhook owns sync)", () => {
    const lib = readFileSync("src/lib/billing/end-trial-now.ts", "utf8");
    expect(lib).not.toMatch(
      /import\s*\{[^}]*applyPlanEntitlements/,
    );
    expect(lib).not.toMatch(
      /await\s+applyPlanEntitlements\s*\(/,
    );
    expect(lib).not.toMatch(
      /await\s+syncOrganizationFromStripeSubscription\s*\(/,
    );
  });

  it("webhook subscription.updated syncs ACTIVE and applies plan entitlements", () => {
    const webhook = readFileSync(
      "src/lib/billing/handle-stripe-webhook.ts",
      "utf8",
    );
    const sync = readFileSync("src/lib/billing/sync-subscription.ts", "utf8");

    expect(webhook).toContain("customer.subscription.updated");
    expect(webhook).toContain("syncSubscriptionById");
    expect(sync).toContain("applyPlanEntitlements");
    expect(sync).toContain('billingStatus === "ACTIVE"');
  });

  it("ACTIVE Standard entitlements are 100 companies", async () => {
    const { resolveEntitlementsForStatus, BILLING_PLAN_STANDARD } =
      await import("@/lib/billing/plans");
    expect(
      resolveEntitlementsForStatus({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "ACTIVE",
      })?.activeResearchedCompanyLimit,
    ).toBe(100);
    expect(
      resolveEntitlementsForStatus({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "TRIALING",
      })?.activeResearchedCompanyLimit,
    ).toBe(25);
  });
});
