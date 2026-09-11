/**
 * Map Stripe ids/status → local plan/billing enums (no Stripe SDK / DB).
 */
import type { BillingStatus } from "@prisma/client";
import {
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_CATALOG,
  resolveStripePriceId,
  resolveStripeProductId,
} from "@/lib/billing/plans";

type StripeSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"
  | (string & {});

export function mapStripeSubscriptionStatus(
  status: StripeSubscriptionStatus,
): BillingStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "UNPAID";
    default:
      return "UNPAID";
  }
}

/**
 * Resolve plan from the subscription's price/product — supports grandfathered
 * prices on the same Product after catalog Price ID changes (console or env).
 */
export function resolvePlanCodeFromStripeIds(input: {
  priceId: string | null;
  productId: string | null;
  /**
   * Extra identifiers from platform console (and any other known catalog IDs).
   * Env-mapped catalog IDs are always checked as well.
   */
  additional?: {
    priceIds?: Array<{ planCode: string; priceId: string }>;
    productIds?: Array<{ planCode: string; productId: string }>;
  };
}): string {
  if (input.priceId) {
    for (const row of input.additional?.priceIds ?? []) {
      if (row.priceId === input.priceId) return row.planCode;
    }
  }
  if (input.productId) {
    for (const row of input.additional?.productIds ?? []) {
      if (row.productId === input.productId) return row.planCode;
    }
  }

  for (const plan of BILLING_PLAN_CATALOG) {
    if (!plan.requiresStripe) continue;
    const base = plan.components.find((c) => c.kind === "recurring_base");
    if (!base || base.kind !== "recurring_base") continue;
    const envPrice = resolveStripePriceId(base.stripePriceIdEnv);
    const envProduct = resolveStripeProductId(base.stripeProductIdEnv);
    if (input.priceId && envPrice && input.priceId === envPrice) {
      return plan.planCode;
    }
    if (input.productId && envProduct && input.productId === envProduct) {
      return plan.planCode;
    }
  }
  return BILLING_PLAN_STANDARD;
}
