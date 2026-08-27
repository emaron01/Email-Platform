/**
 * Billing state shape (free until Stripe Phase C).
 *
 * Organization.accountType — INDIVIDUAL | ENTERPRISE
 * OrganizationBillingProfile:
 *   planCode ("FREE" now; paid codes later as strings)
 *   billingStatus (FREE | TRIALING | ACTIVE | PAST_DUE | CANCELED | UNPAID)
 *   stripeCustomerId / stripeSubscriptionId / currentPeriodEnd — null until Stripe
 *
 * Free → paid without migration: set stripe ids, planCode (e.g. "PRO"), billingStatus ACTIVE.
 */

export const BILLING_PLAN_FREE = "FREE" as const;

export type BillingPlanCode = typeof BILLING_PLAN_FREE | (string & {});

export const FREE_BILLING_DEFAULTS = {
  planCode: BILLING_PLAN_FREE,
  billingStatus: "FREE" as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
};

export function billingPlanLabel(planCode: string): string {
  if (planCode === BILLING_PLAN_FREE) return "Free";
  return planCode;
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
