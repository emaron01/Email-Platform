/**
 * Fetch sellable plan Prices from Stripe for display (never hard-code amounts).
 */
import "server-only";

import { loadFlattenedBillingPrices } from "@/lib/billing/effective-prices";
import { formatStripeMoney } from "@/lib/billing/billing-state";
import {
  BILLING_PLAN_CATALOG,
  BILLING_PLAN_STANDARD,
} from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";

export type CatalogPriceDisplay = {
  planCode: string;
  /** Product name from Stripe, else plan code label. */
  name: string;
  priceId: string;
  unitAmountCents: number | null;
  currency: string | null;
  interval: string | null;
  /** Formatted e.g. "$22 / month"; null if amount missing. */
  priceLabel: string | null;
};

export type CatalogPricesResult = {
  ok: boolean;
  plans: CatalogPriceDisplay[];
  /** True when Stripe was unreachable or returned nothing usable. */
  usedFallback: boolean;
};

function intervalLabel(interval: string | null): string {
  switch (interval) {
    case "month":
      return "month";
    case "year":
      return "year";
    case "week":
      return "week";
    case "day":
      return "day";
    default:
      return interval ?? "";
  }
}

/**
 * Loads active recurring Prices for every sellable catalog plan that has
 * console/env-mapped Price + Product IDs. Safe to call when Stripe is
 * misconfigured — returns usedFallback + empty plans.
 */
export async function fetchSellableCatalogPrices(): Promise<CatalogPricesResult> {
  if (!stripeConfigured()) {
    return { ok: false, plans: [], usedFallback: true };
  }

  const stripe = getStripe();
  const plans: CatalogPriceDisplay[] = [];
  const flattened = await loadFlattenedBillingPrices();

  try {
    for (const plan of BILLING_PLAN_CATALOG) {
      if (!plan.sellable || !plan.requiresStripe) continue;
      const base = plan.components.find((c) => c.kind === "recurring_base");
      if (!base || base.kind !== "recurring_base") continue;

      // Standard IDs come from platform console → env. Other sellable plans
      // (future Premium) still need console fields before they go live.
      const priceId =
        plan.planCode === BILLING_PLAN_STANDARD
          ? flattened.standardMonthlyPriceId
          : null;
      const productId =
        plan.planCode === BILLING_PLAN_STANDARD
          ? flattened.standardProductId
          : null;
      if (!priceId || !productId) continue;

      const price = await stripe.prices.retrieve(priceId, {
        expand: ["product"],
      });
      if (!price.active) continue;

      const productRaw = price.product;
      const productName =
        typeof productRaw === "object" &&
        productRaw &&
        !("deleted" in productRaw && productRaw.deleted)
          ? productRaw.name
          : plan.planCode;

      const unitAmountCents = price.unit_amount;
      const currency = price.currency;
      const interval = price.recurring?.interval ?? null;
      const money =
        unitAmountCents != null
          ? formatStripeMoney(unitAmountCents, currency)
          : null;
      const priceLabel =
        money && interval
          ? `${money} / ${intervalLabel(interval)}`
          : money;

      plans.push({
        planCode: plan.planCode,
        name: productName || plan.planCode,
        priceId: price.id,
        unitAmountCents,
        currency,
        interval,
        priceLabel,
      });
    }

    if (plans.length === 0) {
      return { ok: false, plans: [], usedFallback: true };
    }
    return { ok: true, plans, usedFallback: false };
  } catch {
    return { ok: false, plans: [], usedFallback: true };
  }
}
