/**
 * Payment-lock policy (Phase C — enforcement later).
 *
 * Trial end with a working card: Stripe auto-converts to active — we sync ACTIVE.
 * Card decline at trial conversion: Stripe → past_due; we mirror PAST_DUE and use the
 * existing 7-day grace + PAYMENT_FAILED lock. Do not build a separate trial-expiry path;
 * BillingLockReason.TRIAL_ENDED is reserved/unused for that flow.
 *
 * When locked:
 * - Login and read of existing product data remain allowed.
 * - AI, research, generation, send, and invites are blocked.
 *
 * HARD EXEMPTION — a locked org must still be able to pay us:
 * - Stripe Customer Portal / Checkout paths
 * - Read of local billing STATE only
 *
 * Never collect payment PII in-app.
 */
export const PAYMENT_LOCK_EXEMPT_PATH_PREFIXES = [
  "/settings/billing",
  "/onboarding/subscribe",
  "/api/billing/portal",
  "/api/billing/checkout",
] as const;

export type PaymentLockExemptCapability =
  | "OPEN_STRIPE_CUSTOMER_PORTAL"
  | "START_STRIPE_CHECKOUT"
  | "VIEW_BILLING_STATE";
