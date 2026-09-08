import { describe, expect, it } from "vitest";
import {
  COMPANY_CREDIT_BLOCK,
  BILLING_PLAN_FREE,
  BILLING_PLAN_STANDARD,
  creditExpiryDate,
  getPlanDefinition,
} from "@/lib/billing/plans";
import {
  effectiveCompanyResearchLimit,
  nextCreditExpiry,
  sumActiveCreditCompanies,
} from "@/lib/billing/company-research-credits-math";

describe("billing plans catalog", () => {
  it("defines FREE comps outside Stripe and STANDARD as sellable monthly", () => {
    const free = getPlanDefinition(BILLING_PLAN_FREE);
    const standard = getPlanDefinition(BILLING_PLAN_STANDARD);

    expect(free?.requiresStripe).toBe(false);
    expect(free?.sellable).toBe(false);
    expect(free?.entitlements.activeResearchedCompanyLimit).toBe(50);
    expect(free?.entitlements.monthlyEmailSendLimit).toBeNull();

    expect(standard?.sellable).toBe(true);
    expect(standard?.requiresStripe).toBe(true);
    expect(standard?.trialDays).toBe(7);
    expect(standard?.entitlements.activeResearchedCompanyLimit).toBe(100);
    expect(standard?.entitlements.monthlyEmailSendLimit).toBe(1000);
    expect(standard?.entitlements.dailyEmailSendWarningLimit).toBe(50);
    expect(
      standard?.components.every((c) => c.kind === "recurring_base"),
    ).toBe(true);
  });

  it("treats company credits as a one-time 100-unit pack with 12-month expiry", () => {
    expect(COMPANY_CREDIT_BLOCK.kind).toBe("company_credit_block");
    expect(COMPANY_CREDIT_BLOCK.units).toBe(100);
    expect(COMPANY_CREDIT_BLOCK.expiryMonths).toBe(12);
    expect(COMPANY_CREDIT_BLOCK.stripePriceIdEnv).toBe(
      "STRIPE_PRICE_COMPANY_CREDITS_100",
    );
  });

  it("computes expiry 12 UTC months from grant", () => {
    const granted = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const expires = creditExpiryDate(granted, 12);
    expect(expires.toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });
});

describe("company research credit math", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("sums only unexpired packs into the effective allowance", () => {
    const packs = [
      {
        quantity: 100,
        expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        quantity: 100,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
      {
        quantity: 50,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    ];

    expect(sumActiveCreditCompanies(packs, now)).toBe(150);
    expect(effectiveCompanyResearchLimit(100, packs, now)).toBe(250);
    expect(nextCreditExpiry(packs, now)?.toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
  });

  it("drops expired capacity without changing the plan base", () => {
    const packs = [
      {
        quantity: 100,
        expiresAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ];
    expect(sumActiveCreditCompanies(packs, now)).toBe(0);
    expect(effectiveCompanyResearchLimit(100, packs, now)).toBe(100);
    expect(nextCreditExpiry(packs, now)).toBeNull();
  });
});
