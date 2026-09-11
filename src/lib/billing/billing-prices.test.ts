import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBillingPricesSetting,
  parseBillingPricesSetting,
  resolveEffectiveBillingPrices,
  resolveEnvBillingPrices,
} from "@/lib/billing/billing-prices";

describe("billing.prices PlatformSetting", () => {
  const originals = {
    price: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
    product: process.env.STRIPE_PRODUCT_STANDARD,
    credits: process.env.STRIPE_PRICE_COMPANY_CREDITS_100,
  };

  afterEach(() => {
    for (const [key, value] of [
      ["STRIPE_PRICE_STANDARD_MONTHLY", originals.price],
      ["STRIPE_PRODUCT_STANDARD", originals.product],
      ["STRIPE_PRICE_COMPANY_CREDITS_100", originals.credits],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("parses a full console payload", () => {
    expect(
      parseBillingPricesSetting({
        standardMonthlyPriceId: "price_std",
        standardProductId: "prod_std",
        companyCreditsPriceId: "price_cred",
      }),
    ).toEqual({
      standardMonthlyPriceId: "price_std",
      standardProductId: "prod_std",
      companyCreditsPriceId: "price_cred",
    });
  });

  it("rejects malformed IDs", () => {
    expect(
      parseBillingPricesSetting({
        standardMonthlyPriceId: "not-a-price",
        standardProductId: "prod_std",
        companyCreditsPriceId: "price_cred",
      }),
    ).toBeNull();
    expect(
      parseBillingPricesSetting({
        standardMonthlyPriceId: "price_std",
        standardProductId: "prod_std",
      }),
    ).toBeNull();
  });

  it("falls back to environment when no console row", () => {
    process.env.STRIPE_PRICE_STANDARD_MONTHLY = "price_env";
    process.env.STRIPE_PRODUCT_STANDARD = "prod_env";
    process.env.STRIPE_PRICE_COMPANY_CREDITS_100 = "price_cred_env";

    const effective = resolveEffectiveBillingPrices({ platformSetting: null });
    expect(effective.standardMonthlyPriceId).toMatchObject({
      value: "price_env",
      source: "environment",
    });
    expect(effective.standardProductId.value).toBe("prod_env");
    expect(effective.companyCreditsPriceId.value).toBe("price_cred_env");
  });

  it("prefers platform console over env", () => {
    process.env.STRIPE_PRICE_STANDARD_MONTHLY = "price_env";
    process.env.STRIPE_PRODUCT_STANDARD = "prod_env";
    process.env.STRIPE_PRICE_COMPANY_CREDITS_100 = "price_cred_env";

    const effective = resolveEffectiveBillingPrices({
      platformSetting: {
        standardMonthlyPriceId: "price_console",
        standardProductId: "prod_console",
        companyCreditsPriceId: "price_cred_console",
      },
    });
    expect(effective.standardMonthlyPriceId).toMatchObject({
      value: "price_console",
      source: "platform",
      sourceLabel: "platform console",
    });
    expect(effective.standardProductId.value).toBe("prod_console");
    expect(effective.companyCreditsPriceId.value).toBe("price_cred_console");
  });

  it("builds validated payloads for upsert", () => {
    expect(
      buildBillingPricesSetting({
        standardMonthlyPriceId: " price_abc ",
        standardProductId: "prod_abc",
        companyCreditsPriceId: "price_xyz",
      }),
    ).toEqual({
      standardMonthlyPriceId: "price_abc",
      standardProductId: "prod_abc",
      companyCreditsPriceId: "price_xyz",
    });
  });

  it("is used by Checkout for new subscriptions only (contract)", async () => {
    const { readFileSync } = await import("node:fs");
    const checkout = readFileSync(
      "src/lib/billing/create-checkout-session.ts",
      "utf8",
    );
    const sync = readFileSync("src/lib/billing/sync-subscription.ts", "utf8");
    expect(checkout).toContain("loadEffectiveBillingPrices");
    expect(checkout).toContain("line_items: [{ price: priceId");
    expect(sync).toContain("stripePriceId: mirror.stripePriceId");
    expect(sync).toContain(
      "Mirrors the subscription's Price + discounts (not the env catalog price)",
    );
  });

  it("reads env helpers for mapping fallback", () => {
    delete process.env.STRIPE_PRICE_STANDARD_MONTHLY;
    expect(resolveEnvBillingPrices().standardMonthlyPriceId).toBeNull();
  });
});
