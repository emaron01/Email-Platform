/**
 * One-time Checkout for company research credit blocks.
 * adjustable_quantity enabled so buyers can purchase N×100 companies in one session.
 */
import "server-only";

import { billingAppBaseUrl } from "@/lib/billing/app-base-url";
import {
  COMPANY_CREDIT_BLOCK,
  companyCreditBlockIsCheckoutReady,
  resolveStripePriceId,
} from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

/** Max blocks selectable on Checkout (50 × 100 = 5,000 companies). */
export const COMPANY_CREDIT_CHECKOUT_MAX_BLOCKS = 50;

export type CreateCompanyCreditsCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code: string };

export async function createCompanyCreditsCheckoutSession(input: {
  organizationId: string;
  actorUserId: string;
  /** Initial quantity shown on Checkout (buyer can raise via adjustable_quantity). */
  initialBlocks?: number;
}): Promise<CreateCompanyCreditsCheckoutResult> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }
  if (!companyCreditBlockIsCheckoutReady()) {
    return {
      ok: false,
      error: "Company credit pack price is not configured.",
      code: "PRICE_NOT_CONFIGURED",
    };
  }

  const priceId = resolveStripePriceId(COMPANY_CREDIT_BLOCK.stripePriceIdEnv);
  if (!priceId) {
    return {
      ok: false,
      error: "Company credit pack price is not configured.",
      code: "PRICE_NOT_CONFIGURED",
    };
  }

  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
  });

  if (!profile?.stripeCustomerId) {
    return {
      ok: false,
      error:
        "Subscribe to Standard first so we have a Stripe customer for this organization.",
      code: "NO_STRIPE_CUSTOMER",
    };
  }

  if (
    profile.billingStatus !== "ACTIVE" &&
    profile.billingStatus !== "TRIALING" &&
    profile.billingStatus !== "PAST_DUE"
  ) {
    return {
      ok: false,
      error: "Company credits are available on an active or trial subscription.",
      code: "NOT_ELIGIBLE",
    };
  }

  const initialBlocks = Math.min(
    COMPANY_CREDIT_CHECKOUT_MAX_BLOCKS,
    Math.max(1, Math.floor(input.initialBlocks ?? 1)),
  );

  const stripe = getStripe();
  const baseUrl = billingAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: profile.stripeCustomerId,
    client_reference_id: input.organizationId,
    line_items: [
      {
        price: priceId,
        quantity: initialBlocks,
        adjustable_quantity: {
          enabled: true,
          minimum: 1,
          maximum: COMPANY_CREDIT_CHECKOUT_MAX_BLOCKS,
        },
      },
    ],
    success_url: `${baseUrl}/settings/billing?credits=success`,
    cancel_url: `${baseUrl}/settings/billing?credits=canceled`,
    metadata: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      purpose: "company_research_credits",
      unitsPerBlock: String(COMPANY_CREDIT_BLOCK.units),
    },
    payment_intent_data: {
      metadata: {
        organizationId: input.organizationId,
        purpose: "company_research_credits",
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
