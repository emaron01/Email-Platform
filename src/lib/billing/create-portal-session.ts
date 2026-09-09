/**
 * Create a Stripe Customer Portal session (update card, cancel, invoices).
 * return_url always from APP_URL via billingAppBaseUrl() — never the incoming request host.
 */
import "server-only";

import { billingAppBaseUrl } from "@/lib/billing/app-base-url";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

export type CreatePortalSessionResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code: string };

export async function createBillingPortalSession(input: {
  organizationId: string;
}): Promise<CreatePortalSessionResult> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: { stripeCustomerId: true },
  });

  if (!profile?.stripeCustomerId) {
    return {
      ok: false,
      error: "No Stripe customer on this organization yet.",
      code: "NO_STRIPE_CUSTOMER",
    };
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${billingAppBaseUrl()}/settings/billing`,
  });

  if (!session.url) {
    return {
      ok: false,
      error: "Stripe did not return a Customer Portal URL.",
      code: "PORTAL_URL_MISSING",
    };
  }

  return { ok: true, url: session.url };
}
