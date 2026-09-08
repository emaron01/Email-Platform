/**
 * Billing state shape.
 *
 * Organization.accountType — INDIVIDUAL | ENTERPRISE
 * OrganizationBillingProfile:
 *   planCode ("FREE" | "STANDARD" | future codes as strings)
 *   billingStatus (FREE | TRIALING | ACTIVE | PAST_DUE | CANCELED | UNPAID)
 *   stripeCustomerId / stripeSubscriptionId / stripePriceId / stripeProductId
 *   trialEndsAt / gracePeriodEndsAt / lockReason / cancelAtPeriodEnd / canceledAt
 *
 * Company research capacity = plan base (UsagePolicy) + unexpired CompanyResearchCredit packs.
 */

import { BILLING_PLAN_FREE, BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

export { BILLING_PLAN_FREE, BILLING_PLAN_STANDARD };

export type BillingPlanCode = typeof BILLING_PLAN_FREE | (string & {});

export const FREE_BILLING_DEFAULTS = {
  planCode: BILLING_PLAN_FREE,
  billingStatus: "FREE" as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePriceId: null,
  stripeProductId: null,
  currentPeriodEnd: null,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  lockReason: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
};

export function billingPlanLabel(planCode: string): string {
  switch (planCode) {
    case BILLING_PLAN_FREE:
      return "Free";
    case BILLING_PLAN_STANDARD:
      return "Standard";
    case "PREMIUM":
      return "Premium";
    case "ENTERPRISE":
      return "Enterprise";
    default:
      return planCode;
  }
}

export function billingStatusLabel(status: string): string {
  switch (status) {
    case "FREE":
      return "Free (no payment required)";
    case "TRIALING":
      return "Trialing";
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Past due";
    case "CANCELED":
      return "Canceled";
    case "UNPAID":
      return "Unpaid";
    default:
      return status;
  }
}

export function billingLockReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "TRIAL_ENDED":
      return "Trial ended";
    case "PAYMENT_FAILED":
      return "Payment failed";
    case "CANCELED":
      return "Subscription canceled";
    default:
      return reason ?? "—";
  }
}

export function formatStripeMoney(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amountCents == null) return "—";
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${code}`;
  }
}

export function formatPriceInterval(interval: string | null | undefined): string {
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
      return interval ?? "—";
  }
}

/** Ops-facing line: effective amount (after discount) / interval. */
export function formatCustomerPayingAmount(input: {
  effectiveUnitAmountCents: number | null;
  listUnitAmountCents: number | null;
  currency: string | null;
  interval: string | null;
}): string {
  const amount =
    input.effectiveUnitAmountCents ?? input.listUnitAmountCents ?? null;
  if (amount == null) return "—";
  return `${formatStripeMoney(amount, input.currency)} / ${formatPriceInterval(input.interval)}`;
}

export function formatDiscountSummary(input: {
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  couponId: string | null;
}): string {
  const parts: string[] = [];
  if (input.percentOff != null && input.percentOff > 0) {
    parts.push(`${input.percentOff}% off`);
  }
  if (input.amountOffCents != null && input.amountOffCents > 0) {
    parts.push(`${formatStripeMoney(input.amountOffCents, input.currency)} off`);
  }
  if (parts.length === 0) return "None";
  const base = parts.join(" + ");
  return input.couponId ? `${base} (${input.couponId})` : base;
}

/** Compare stored price to current env catalog price for STANDARD (ops flag). */
export function isOnCurrentCatalogPrice(
  stripePriceId: string | null | undefined,
  catalogPriceId: string | null | undefined,
): boolean | null {
  if (!stripePriceId || !catalogPriceId) return null;
  return stripePriceId === catalogPriceId;
}
