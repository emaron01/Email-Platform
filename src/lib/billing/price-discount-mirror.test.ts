import { describe, expect, it } from "vitest";
import {
  applyCouponsToUnitAmount,
  buildMirroredPriceDiscount,
  hasActiveDiscount,
} from "@/lib/billing/price-discount-mirror";
import {
  formatCustomerPayingAmount,
  formatDiscountSummary,
  isOnCurrentCatalogPrice,
} from "@/lib/billing/billing-state";
import {
  mapStripeSubscriptionStatus,
  resolvePlanCodeFromStripeIds,
} from "@/lib/billing/stripe-plan-mapping";

describe("price-discount-mirror", () => {
  it("applies percent then amount_off to list unit amount", () => {
    // $22.00 with 10% off → $19.80; then $2 off → $17.80
    expect(
      applyCouponsToUnitAmount(2200, [
        { id: "c1", percentOff: 10, amountOffCents: null },
        { id: "c2", percentOff: null, amountOffCents: 200 },
      ]),
    ).toBe(1780);
  });

  it("mirrors effective amount below list when discounted", () => {
    const mirror = buildMirroredPriceDiscount({
      priceId: "price_old",
      productId: "prod_std",
      unitAmountCents: 2200,
      currency: "usd",
      interval: "month",
      coupons: [{ id: "coup_10", percentOff: 10, amountOffCents: null }],
    });
    expect(mirror.stripePriceUnitAmountCents).toBe(2200);
    expect(mirror.stripeEffectiveUnitAmountCents).toBe(1980);
    expect(mirror.stripeDiscountPercentOff).toBe(10);
    expect(hasActiveDiscount(mirror)).toBe(true);
  });

  it("shows no discount when coupons empty", () => {
    const mirror = buildMirroredPriceDiscount({
      priceId: "price_x",
      productId: "prod_x",
      unitAmountCents: 2200,
      currency: "usd",
      interval: "month",
      coupons: [],
    });
    expect(mirror.stripeEffectiveUnitAmountCents).toBe(2200);
    expect(hasActiveDiscount(mirror)).toBe(false);
  });
});

describe("billing display helpers", () => {
  it("formats paying amount from effective cents", () => {
    expect(
      formatCustomerPayingAmount({
        effectiveUnitAmountCents: 1980,
        listUnitAmountCents: 2200,
        currency: "usd",
        interval: "month",
      }),
    ).toMatch(/\$19\.80/);
  });

  it("formats discount summary", () => {
    expect(
      formatDiscountSummary({
        percentOff: 20,
        amountOffCents: null,
        currency: "usd",
        couponId: "coup_20",
      }),
    ).toBe("20% off (coup_20)");
  });

  it("detects grandfathered price vs catalog", () => {
    expect(isOnCurrentCatalogPrice("price_old", "price_new")).toBe(false);
    expect(isOnCurrentCatalogPrice("price_new", "price_new")).toBe(true);
    expect(isOnCurrentCatalogPrice(null, "price_new")).toBeNull();
  });
});

describe("subscription status / plan mapping", () => {
  it("maps Stripe statuses to local billing statuses", () => {
    expect(mapStripeSubscriptionStatus("trialing")).toBe("TRIALING");
    expect(mapStripeSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("CANCELED");
  });

  it("falls back to STANDARD when price/product not in env catalog", () => {
    expect(
      resolvePlanCodeFromStripeIds({
        priceId: "price_grandfathered",
        productId: "prod_unknown",
      }),
    ).toBe("STANDARD");
  });
});
