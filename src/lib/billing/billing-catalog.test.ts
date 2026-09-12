import { describe, expect, it } from "vitest";
import {
  catalogFloorsToResolved,
  defaultBillingCatalogSetting,
  findCatalogPlan,
  parseBillingCatalogSetting,
  resolveCatalogEntitlementsForStatus,
  PLATFORM_SETTING_BILLING_CATALOG,
} from "@/lib/billing/billing-catalog";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

describe("billing.catalog", () => {
  it("seeds Standard with current floors and marketing bullets", () => {
    const catalog = defaultBillingCatalogSetting();
    const standard = findCatalogPlan(catalog, BILLING_PLAN_STANDARD);
    expect(standard).toBeTruthy();
    expect(standard!.displayName).toBe("Standard");
    expect(standard!.sellable).toBe(true);
    expect(standard!.stripePriceId).toBeNull();
    expect(standard!.entitlementFloors.trial?.companyResearchLimit).toBe(25);
    expect(standard!.entitlementFloors.paid.companyResearchLimit).toBe(100);
    expect(standard!.entitlementFloors.paid.dailyAiGenerationLimit).toBe(500);
    expect(standard!.companyCredits?.blockSize).toBe(100);
    expect(standard!.featureBullets.length).toBeGreaterThan(2);
    expect(PLATFORM_SETTING_BILLING_CATALOG).toBe("billing.catalog");
  });

  it("parses a round-tripped default catalog", () => {
    const seeded = defaultBillingCatalogSetting();
    const parsed = parseBillingCatalogSetting(seeded);
    expect(parsed).toEqual(seeded);
  });

  it("rejects invalid payloads", () => {
    expect(parseBillingCatalogSetting(null)).toBeNull();
    expect(parseBillingCatalogSetting({ plans: [] })).toBeNull();
    expect(
      parseBillingCatalogSetting({
        plans: [{ planCode: "STANDARD", displayName: "X" }],
      }),
    ).toBeNull();
  });

  it("resolves trial vs paid floors from catalog", () => {
    const catalog = defaultBillingCatalogSetting();
    const trial = resolveCatalogEntitlementsForStatus({
      catalog,
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "TRIALING",
    });
    const paid = resolveCatalogEntitlementsForStatus({
      catalog,
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "ACTIVE",
    });
    expect(trial?.activeResearchedCompanyLimit).toBe(25);
    expect(paid?.activeResearchedCompanyLimit).toBe(100);
    expect(paid?.dailyAiGenerationLimit).toBe(500);
  });

  it("falls back to plans.ts when catalog is null", () => {
    const paid = resolveCatalogEntitlementsForStatus({
      catalog: null,
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "ACTIVE",
    });
    expect(paid?.activeResearchedCompanyLimit).toBe(100);
    expect(
      catalogFloorsToResolved(
        defaultBillingCatalogSetting().plans[0]!.entitlementFloors.paid,
      ).dailyEmailSendWarningLimit,
    ).toBe(50);
  });
});
