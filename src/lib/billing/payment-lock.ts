/**
 * Payment-lock policy (Phase C — not enforced yet).
 *
 * When an org is locked for payment failure (after 7-day grace) or trial expiry:
 * - Login and read of existing product data remain allowed.
 * - AI, research, generation, send, and invites are blocked.
 *
 * HARD EXEMPTION — a locked org must still be able to pay us:
 * - Stripe Customer Portal session creation
 * - Checkout / update-payment return URLs
 * - Read of local billing STATE only (status, plan code, stripeCustomerId refs)
 *
 * Never collect or display card numbers, CVC, expiry, billing addresses, tax IDs,
 * or invoice PDFs in-app. Stripe hosts payment UI; we store identifiers + status only.
 *
 * Billing state lives on OrganizationBillingProfile (planCode, billingStatus,
 * stripeCustomerId, stripeSubscriptionId, currentPeriodEnd). See billing-state.ts.
 */
export const PAYMENT_LOCK_EXEMPT_PATH_PREFIXES = [
  "/settings/billing",
  "/api/billing/portal",
  "/api/billing/checkout",
] as const;

export type PaymentLockExemptCapability =
  | "OPEN_STRIPE_CUSTOMER_PORTAL"
  | "START_STRIPE_CHECKOUT"
  | "VIEW_BILLING_STATE";
