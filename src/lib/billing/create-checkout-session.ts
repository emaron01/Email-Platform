/**
 * Create Stripe Checkout Session for STANDARD or TEAM subscription
 * (trial + promo codes + seat quantity).
 */
import "server-only";

import { billingAppBaseUrl } from "@/lib/billing/app-base-url";
import {
  effectivePricesAreCheckoutReady,
  priceIdsForPlan,
} from "@/lib/billing/billing-prices";
import { loadEffectiveBillingPrices } from "@/lib/billing/effective-prices";
import { loadEffectiveTrialPeriod } from "@/lib/billing/effective-trial";
import {
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
  getPlanDefinition,
  planUsesSeatBilling,
} from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import {
  clampSeatQuantity,
  defaultMaxSeatsForPlan,
  defaultSeatQuantityForPlan,
} from "@/lib/org/seat-limits";
import { prisma } from "@/lib/prisma";

export type CreatePlanCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code: string };

/** @deprecated Prefer createPlanCheckoutSession */
export type CreateStandardCheckoutResult = CreatePlanCheckoutResult;

export async function createPlanCheckoutSession(input: {
  organizationId: string;
  actorUserId: string;
  actorEmail: string;
  planCode?: string;
  seatQuantity?: number;
}): Promise<CreatePlanCheckoutResult> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const planCode =
    input.planCode === BILLING_PLAN_TEAM
      ? BILLING_PLAN_TEAM
      : BILLING_PLAN_STANDARD;

  if (input.planCode === "ENTERPRISE") {
    return {
      ok: false,
      error: "Enterprise is not available for self-serve checkout. Contact us.",
      code: "ENTERPRISE_CONTACT_US",
    };
  }

  const prices = await loadEffectiveBillingPrices();
  if (!effectivePricesAreCheckoutReady(prices, planCode)) {
    return {
      ok: false,
      error: `${planCode === BILLING_PLAN_TEAM ? "Team" : "Standard"} plan price is not configured.`,
      code: "PRICE_NOT_CONFIGURED",
    };
  }

  const plan = getPlanDefinition(planCode);
  const { priceId } = priceIdsForPlan(prices, planCode);
  if (!priceId) {
    return {
      ok: false,
      error: `${planCode === BILLING_PLAN_TEAM ? "Team" : "Standard"} plan price is not configured.`,
      code: "PRICE_NOT_CONFIGURED",
    };
  }

  const maxSeats = defaultMaxSeatsForPlan(planCode);
  const quantity = planUsesSeatBilling(planCode)
    ? clampSeatQuantity({
        planCode,
        quantity: input.seatQuantity ?? defaultSeatQuantityForPlan(planCode),
        maxSeats,
      })
    : 1;

  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
  });

  if (
    profile?.stripeSubscriptionId &&
    (profile.billingStatus === "ACTIVE" ||
      profile.billingStatus === "TRIALING" ||
      profile.billingStatus === "PAST_DUE")
  ) {
    return {
      ok: false,
      error:
        "This organization already has a subscription. Use Manage billing to update your card or cancel.",
      code: "ALREADY_SUBSCRIBED",
    };
  }

  const stripe = getStripe();
  let customerId = profile?.stripeCustomerId ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.billingEmail?.trim() || input.actorEmail,
      metadata: {
        organizationId: input.organizationId,
      },
    });
    customerId = customer.id;
  }

  await prisma.organizationBillingProfile.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      billingEmail: profile?.billingEmail ?? input.actorEmail,
      stripeCustomerId: customerId,
      seatQuantity: quantity,
      maxSeats,
      planCode,
    },
    update: {
      stripeCustomerId: customerId,
      billingEmail: profile?.billingEmail ?? input.actorEmail,
      seatQuantity: quantity,
      maxSeats,
      planCode,
    },
  });

  const effective =
    plan?.trialDays != null
      ? await loadEffectiveTrialPeriod({ planCode })
      : null;
  const trialDays = effective?.days ?? null;
  const baseUrl = billingAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.organizationId,
    line_items: [{ price: priceId, quantity }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/settings/billing?checkout=success`,
    cancel_url: `${baseUrl}/onboarding/subscribe?checkout=canceled`,
    metadata: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      planCode,
      seatQuantity: String(quantity),
    },
    subscription_data: {
      ...(trialDays != null ? { trial_period_days: trialDays } : {}),
      metadata: {
        organizationId: input.organizationId,
        planCode,
        seatQuantity: String(quantity),
      },
    },
    payment_method_collection: "always",
  });

  if (!session.url) {
    return {
      ok: false,
      error: "Stripe did not return a Checkout URL.",
      code: "CHECKOUT_URL_MISSING",
    };
  }

  return { ok: true, url: session.url };
}

export async function createStandardCheckoutSession(input: {
  organizationId: string;
  actorUserId: string;
  actorEmail: string;
}): Promise<CreatePlanCheckoutResult> {
  return createPlanCheckoutSession({
    ...input,
    planCode: BILLING_PLAN_STANDARD,
    seatQuantity: 1,
  });
}
