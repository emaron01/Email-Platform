/**
 * Create Stripe Checkout Session for STANDARD subscription (trial + promo codes).
 */
import "server-only";

import { billingAppBaseUrl } from "@/lib/billing/app-base-url";
import {
  BILLING_PLAN_STANDARD,
  getPlanDefinition,
  planIsCheckoutReady,
  resolveStripePriceId,
} from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { loadEffectiveTrialPeriod } from "@/lib/billing/effective-trial";
import { prisma } from "@/lib/prisma";

export type CreateStandardCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code: string };

export async function createStandardCheckoutSession(input: {
  organizationId: string;
  actorUserId: string;
  actorEmail: string;
}): Promise<CreateStandardCheckoutResult> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }
  if (!planIsCheckoutReady(BILLING_PLAN_STANDARD)) {
    return {
      ok: false,
      error: "Standard plan price is not configured.",
      code: "PRICE_NOT_CONFIGURED",
    };
  }

  const plan = getPlanDefinition(BILLING_PLAN_STANDARD);
  const base = plan?.components.find((c) => c.kind === "recurring_base");
  if (!base || base.kind !== "recurring_base") {
    return {
      ok: false,
      error: "Standard plan is missing a recurring price.",
      code: "PRICE_NOT_CONFIGURED",
    };
  }
  const priceId = resolveStripePriceId(base.stripePriceIdEnv);
  if (!priceId) {
    return {
      ok: false,
      error: "Standard plan price is not configured.",
      code: "PRICE_NOT_CONFIGURED",
    };
  }

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
    await prisma.organizationBillingProfile.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organizationId: input.organizationId,
        billingEmail: profile?.billingEmail ?? input.actorEmail,
        stripeCustomerId: customerId,
      },
      update: {
        stripeCustomerId: customerId,
        billingEmail: profile?.billingEmail ?? input.actorEmail,
      },
    });
  }

  // Trial length: platform console → env. Only applied to NEW Checkout sessions.
  // Existing Stripe subscriptions keep their trial_end; changing the setting does not rewrite them.
  const effective =
    plan?.trialDays != null
      ? await loadEffectiveTrialPeriod({ planCode: BILLING_PLAN_STANDARD })
      : null;
  const trialDays = effective?.days ?? null;
  const baseUrl = billingAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.organizationId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/settings/billing?checkout=success`,
    cancel_url: `${baseUrl}/onboarding/subscribe?checkout=canceled`,
    metadata: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      planCode: BILLING_PLAN_STANDARD,
    },
    subscription_data: {
      ...(trialDays != null ? { trial_period_days: trialDays } : {}),
      metadata: {
        organizationId: input.organizationId,
        planCode: BILLING_PLAN_STANDARD,
      },
    },
    // Required so trial orgs can convert early (trial_end: 'now') with a card on file.
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
