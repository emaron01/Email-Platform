/**
 * End a Stripe trial immediately (trial_end: 'now').
 * Does NOT apply entitlements here — customer.subscription.updated webhook
 * runs syncOrganizationFromStripeSubscription → applyPlanEntitlements.
 */
import "server-only";

import { resolveCatalogEntitlementsForStatus } from "@/lib/billing/billing-catalog";
import { billingPlanLabel } from "@/lib/billing/billing-state";
import { loadEffectiveBillingCatalog } from "@/lib/billing/effective-catalog";
import { getPlanDefinition, planUsesSeatBilling } from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

export type EndTrialNowResult =
  | {
      ok: true;
      message: string;
      subscriptionId: string;
    }
  | {
      ok: false;
      error: string;
      code: string;
    };

export async function customerHasCardOnFile(input: {
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
}): Promise<boolean> {
  if (!stripeConfigured()) return false;
  const stripe = getStripe();

  if (input.stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(
      input.stripeSubscriptionId,
      { expand: ["default_payment_method"] },
    );
    if (subscription.default_payment_method) return true;
  }

  const customer = await stripe.customers.retrieve(input.stripeCustomerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return false;
  if (customer.invoice_settings?.default_payment_method) return true;

  const methods = await stripe.paymentMethods.list({
    customer: input.stripeCustomerId,
    type: "card",
    limit: 1,
  });
  return methods.data.length > 0;
}

/** Whether the research UI may offer early trial conversion. */
export async function canOfferEarlyTrialConversion(
  organizationId: string,
): Promise<boolean> {
  if (!stripeConfigured()) return false;

  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
    select: {
      billingStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (
    !profile ||
    profile.billingStatus !== "TRIALING" ||
    !profile.stripeCustomerId ||
    !profile.stripeSubscriptionId
  ) {
    return false;
  }

  try {
    return await customerHasCardOnFile({
      stripeCustomerId: profile.stripeCustomerId,
      stripeSubscriptionId: profile.stripeSubscriptionId,
    });
  } catch {
    return false;
  }
}

async function paidCapacityMessage(input: {
  planCode: string;
  seatQuantity: number;
}): Promise<string> {
  const planLabel = billingPlanLabel(input.planCode);
  const { catalog } = await loadEffectiveBillingCatalog();
  const paid = resolveCatalogEntitlementsForStatus({
    catalog,
    planCode: input.planCode,
    billingStatus: "ACTIVE",
  });
  const planDef = getPlanDefinition(input.planCode);
  const perSeat =
    paid?.companiesPerSeat ?? planDef?.seats.companiesPerSeat ?? null;
  if (planUsesSeatBilling(input.planCode) && perSeat != null) {
    const total = perSeat * Math.max(1, input.seatQuantity);
    return `${planLabel} billing starts today with FULL ACCESS (${total} companies; ${perSeat} per seat).`;
  }
  const floor =
    paid?.activeResearchedCompanyLimit ??
    planDef?.entitlements.activeResearchedCompanyLimit;
  if (floor != null) {
    return `${planLabel} billing starts today with FULL ACCESS (${floor} companies).`;
  }
  return `${planLabel} billing starts today.`;
}

/**
 * Stripe: subscriptions.update({ trial_end: 'now' }).
 * Entitlements update only via webhook sync — do not call applyPlanEntitlements here.
 */
export async function endTrialNow(input: {
  organizationId: string;
}): Promise<EndTrialNowResult> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: {
      billingStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      planCode: true,
      seatQuantity: true,
    },
  });

  if (!profile || profile.billingStatus !== "TRIALING") {
    return {
      ok: false,
      error: "Only trial subscriptions can convert early.",
      code: "NOT_TRIALING",
    };
  }

  if (!profile.stripeCustomerId || !profile.stripeSubscriptionId) {
    return {
      ok: false,
      error: "No Stripe subscription on this organization.",
      code: "NO_SUBSCRIPTION",
    };
  }

  const hasCard = await customerHasCardOnFile({
    stripeCustomerId: profile.stripeCustomerId,
    stripeSubscriptionId: profile.stripeSubscriptionId,
  });
  if (!hasCard) {
    return {
      ok: false,
      error: `Add a card in Billing before converting. ${billingPlanLabel(profile.planCode)} billing starts when you convert.`,
      code: "NO_PAYMENT_METHOD",
    };
  }

  const stripe = getStripe();
  try {
    await stripe.subscriptions.update(profile.stripeSubscriptionId, {
      trial_end: "now",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Stripe could not end the trial.";
    return {
      ok: false,
      error: message,
      code: "STRIPE_UPDATE_FAILED",
    };
  }

  // Intentionally no local billingStatus / entitlement write.
  // customer.subscription.updated → syncOrganizationFromStripeSubscription
  // → applyPlanEntitlements.
  const capacityBit = await paidCapacityMessage({
    planCode: profile.planCode,
    seatQuantity: profile.seatQuantity,
  });
  return {
    ok: true,
    subscriptionId: profile.stripeSubscriptionId,
    message: `Trial ended. Stripe will charge your card and start ${capacityBit} Your allowance appears once Stripe confirms (usually a few seconds).`,
  };
}
