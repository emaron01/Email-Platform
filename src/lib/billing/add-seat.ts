/**
 * Increment seat quantity on an existing Team/Enterprise Stripe subscription.
 */
import "server-only";

import { BILLING_PLAN_TEAM, planUsesSeatBilling } from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { retrieveSubscriptionExpanded } from "@/lib/billing/sync-subscription";
import {
  SEAT_LIMIT_REACHED_MESSAGE,
  clampSeatQuantity,
} from "@/lib/org/seat-limits";
import { prisma } from "@/lib/prisma";

export type AddSeatResult =
  | { ok: true; seatQuantity: number }
  | { ok: false; error: string; code: string };

export async function addSeatToSubscription(input: {
  organizationId: string;
}): Promise<AddSeatResult> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
  });
  if (!profile?.stripeSubscriptionId) {
    return {
      ok: false,
      error: "No active subscription to add a seat to.",
      code: "NO_SUBSCRIPTION",
    };
  }
  if (!planUsesSeatBilling(profile.planCode)) {
    return {
      ok: false,
      error: "Seat adds are only available on Team plans.",
      code: "PLAN_NOT_ELIGIBLE",
    };
  }

  const nextQuantity = profile.seatQuantity + 1;
  if (nextQuantity > profile.maxSeats) {
    return {
      ok: false,
      error: SEAT_LIMIT_REACHED_MESSAGE,
      code: "SEAT_CAP",
    };
  }

  const clamped = clampSeatQuantity({
    planCode: profile.planCode,
    quantity: nextQuantity,
    maxSeats: profile.maxSeats,
  });
  if (clamped <= profile.seatQuantity) {
    return {
      ok: false,
      error: SEAT_LIMIT_REACHED_MESSAGE,
      code: "SEAT_CAP",
    };
  }

  const subscription = await retrieveSubscriptionExpanded(
    profile.stripeSubscriptionId,
  );
  const item = subscription.items.data[0];
  if (!item) {
    return {
      ok: false,
      error: "Subscription has no line items.",
      code: "NO_LINE_ITEM",
    };
  }

  const stripe = getStripe();
  await stripe.subscriptions.update(profile.stripeSubscriptionId, {
    items: [{ id: item.id, quantity: clamped }],
    proration_behavior: "create_prorations",
    metadata: {
      ...subscription.metadata,
      seatQuantity: String(clamped),
      planCode: profile.planCode || BILLING_PLAN_TEAM,
    },
  });

  // Webhook sync will also update; write optimistically for UI.
  await prisma.organizationBillingProfile.update({
    where: { organizationId: input.organizationId },
    data: { seatQuantity: clamped },
  });

  return { ok: true, seatQuantity: clamped };
}
