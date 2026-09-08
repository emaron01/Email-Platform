/**
 * Create Stripe Checkout Session for STANDARD subscription (trial + promo codes).
 */
import "server-only";

import {
  BILLING_PLAN_STANDARD,
  getPlanDefinition,
  planIsCheckoutReady,
  resolveStripePriceId,
} from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

function appBaseUrl(): string {
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!base) {
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required for Checkout");
  }
  return base.replace(/\/$/, "");
}

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
        "This organization already has a subscription. Manage billing in Stripe Customer Portal (coming soon) or the Stripe Dashboard.",
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

  const trialDays = plan?.trialDays ?? 7;
  const baseUrl = appBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.organizationId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/settings/billing?checkout=success`,
    cancel_url: `${baseUrl}/settings/billing?checkout=canceled`,
    metadata: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      planCode: BILLING_PLAN_STANDARD,
    },
    subscription_data: {
      trial_period_days: trialDays,
      metadata: {
        organizationId: input.organizationId,
        planCode: BILLING_PLAN_STANDARD,
      },
    },
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
