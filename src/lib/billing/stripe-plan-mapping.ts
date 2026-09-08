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
 * prices on the same Product after env catalog Price ID changes.
 */
export function resolvePlanCodeFromStripeIds(input: {
  priceId: string | null;
  productId: string | null;
}): string {
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
