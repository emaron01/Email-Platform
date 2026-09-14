/**
 * Payment-lock policy + enforcement.
 *
 * Trial end with a working card: Stripe auto-converts to active — we sync ACTIVE.
 * Card decline at trial conversion: Stripe → past_due; we mirror PAST_DUE and use the
 * existing 7-day grace + PAYMENT_FAILED lock. Do not build a separate trial-expiry path;
 * BillingLockReason.TRIAL_ENDED is reserved/unused for that flow.
 *
 * When locked:
 * - Login and read of existing product data remain allowed.
 * - AI, research, generation, send, and org-admin invites are blocked.
 *
 * HARD EXEMPTION — a locked org must still be able to pay us:
 * - Stripe Customer Portal / Checkout paths
 * - Read of local billing STATE only
 *
 * Never collect payment PII in-app.
 */
import type { BillingLockReason } from "@prisma/client";
import { BILLING_PLAN_COMPED } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma-client";

export const PAYMENT_LOCK_EXEMPT_PATH_PREFIXES = [
  "/settings/billing",
  "/onboarding/subscribe",
  "/onboarding/eula",
  "/api/billing/portal",
  "/api/billing/checkout",
  "/api/billing/credits-checkout",
  "/api/billing/end-trial",
] as const;

export type PaymentLockExemptCapability =
  | "OPEN_STRIPE_CUSTOMER_PORTAL"
  | "START_STRIPE_CHECKOUT"
  | "VIEW_BILLING_STATE";

/** 7-day grace after PAST_DUE before spend is locked. */
export const PAYMENT_LOCK_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export class PaymentLockError extends Error {
  readonly code = "PAYMENT_LOCKED";
  readonly lockReason: string | null;

  constructor(message: string, lockReason: string | null = null) {
    super(message);
    this.name = "PaymentLockError";
    this.lockReason = lockReason;
  }
}

export type PaymentLockProfile = {
  planCode: string;
  billingStatus: string;
  stripeSubscriptionId?: string | null;
  lockReason?: string | null;
  gracePeriodEndsAt?: Date | null;
};

function isCompedOrFree(profile: PaymentLockProfile): boolean {
  return (
    profile.planCode === BILLING_PLAN_COMPED ||
    profile.planCode === "FREE" ||
    profile.billingStatus === "FREE"
  );
}

/**
 * Pure lock check. Status-first so already-synced CANCELED orgs lock even when
 * lockReason was never written (pre-enforcement sync).
 */
export function isPaymentLocked(
  profile: PaymentLockProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile || isCompedOrFree(profile)) return false;

  switch (profile.billingStatus) {
    case "ACTIVE":
    case "TRIALING":
    case "FREE":
      return false;
    case "CANCELED":
      return true;
    case "UNPAID":
      // Pre-checkout UNPAID (no sub id) → checkout gate, not this lock.
      // Stripe "unpaid" keeps a subscription id → lock immediately.
      return Boolean(profile.stripeSubscriptionId);
    case "PAST_DUE": {
      if (profile.gracePeriodEndsAt) {
        return now.getTime() >= profile.gracePeriodEndsAt.getTime();
      }
      // Grace not written yet — treat as still within grace; heal/sync starts the clock.
      return false;
    }
    default:
      return false;
  }
}

export function paymentLockUserMessage(
  profile: PaymentLockProfile,
): string {
  switch (profile.billingStatus) {
    case "CANCELED":
      return "Your subscription is canceled. Open Billing to resubscribe before researching, generating, or sending email.";
    case "PAST_DUE":
      return "Your payment is past due. Update billing to restore research, email generation, and sending.";
    case "UNPAID":
      return "Your subscription payment failed. Open Billing to update payment and restore access.";
    default:
      return "Billing access is locked. Open Billing to restore research, email generation, and sending.";
  }
}

/**
 * Lock fields to persist on Stripe sync (and cancel fallback).
 * Preserves an existing PAST_DUE grace end so webhooks do not reset the clock.
 */
export function nextPaymentLockFields(input: {
  previous: {
    billingStatus: string;
    lockReason: string | null;
    gracePeriodEndsAt: Date | null;
  } | null;
  billingStatus: string;
  now?: Date;
}): {
  lockReason: BillingLockReason | null;
  gracePeriodEndsAt: Date | null;
} {
  const now = input.now ?? new Date();

  if (
    input.billingStatus === "ACTIVE" ||
    input.billingStatus === "TRIALING" ||
    input.billingStatus === "FREE"
  ) {
    return { lockReason: null, gracePeriodEndsAt: null };
  }

  if (input.billingStatus === "CANCELED") {
    return { lockReason: "CANCELED", gracePeriodEndsAt: null };
  }

  if (input.billingStatus === "UNPAID") {
    // Stripe-mapped unpaid / incomplete — immediate lock (no grace).
    return { lockReason: "PAYMENT_FAILED", gracePeriodEndsAt: null };
  }

  if (input.billingStatus === "PAST_DUE") {
    if (
      input.previous?.billingStatus === "PAST_DUE" &&
      input.previous.gracePeriodEndsAt
    ) {
      return {
        lockReason: "PAYMENT_FAILED",
        gracePeriodEndsAt: input.previous.gracePeriodEndsAt,
      };
    }
    return {
      lockReason: "PAYMENT_FAILED",
      gracePeriodEndsAt: new Date(now.getTime() + PAYMENT_LOCK_GRACE_MS),
    };
  }

  return { lockReason: null, gracePeriodEndsAt: null };
}

type LockSelect = {
  planCode: string;
  billingStatus: string;
  stripeSubscriptionId: string | null;
  lockReason: BillingLockReason | null;
  gracePeriodEndsAt: Date | null;
};

/**
 * Backfill lockReason / grace for orgs synced before enforcement.
 */
async function healPaymentLockFields(
  organizationId: string,
  profile: LockSelect,
  now: Date = new Date(),
): Promise<LockSelect> {
  const next = nextPaymentLockFields({
    previous: {
      billingStatus: profile.billingStatus,
      lockReason: profile.lockReason,
      gracePeriodEndsAt: profile.gracePeriodEndsAt,
    },
    billingStatus: profile.billingStatus,
    now,
  });

  // Pre-checkout UNPAID must not get PAYMENT_FAILED written.
  if (
    profile.billingStatus === "UNPAID" &&
    !profile.stripeSubscriptionId
  ) {
    if (profile.lockReason == null && profile.gracePeriodEndsAt == null) {
      return profile;
    }
    return prisma.organizationBillingProfile.update({
      where: { organizationId },
      data: { lockReason: null, gracePeriodEndsAt: null },
      select: {
        planCode: true,
        billingStatus: true,
        stripeSubscriptionId: true,
        lockReason: true,
        gracePeriodEndsAt: true,
      },
    });
  }

  const needsWrite =
    profile.lockReason !== next.lockReason ||
    (profile.gracePeriodEndsAt?.getTime() ?? null) !==
      (next.gracePeriodEndsAt?.getTime() ?? null);

  if (!needsWrite) return profile;

  return prisma.organizationBillingProfile.update({
    where: { organizationId },
    data: {
      lockReason: next.lockReason,
      gracePeriodEndsAt: next.gracePeriodEndsAt,
    },
    select: {
      planCode: true,
      billingStatus: true,
      stripeSubscriptionId: true,
      lockReason: true,
      gracePeriodEndsAt: true,
    },
  });
}

/** Throw when the org must not spend (research / generation / send / invites). */
export async function assertOrganizationNotPaymentLocked(
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
    select: {
      planCode: true,
      billingStatus: true,
      stripeSubscriptionId: true,
      lockReason: true,
      gracePeriodEndsAt: true,
    },
  });
  if (!profile) return;

  const healed = await healPaymentLockFields(organizationId, profile, now);
  if (!isPaymentLocked(healed, now)) return;

  throw new PaymentLockError(
    paymentLockUserMessage(healed),
    healed.lockReason ?? healed.billingStatus,
  );
}
