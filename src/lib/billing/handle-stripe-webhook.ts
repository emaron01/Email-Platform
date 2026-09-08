/**
 * Stripe webhook dispatcher — claim event id, then sync subscription state.
 * Never persist the raw event payload.
 */
import "server-only";

import type Stripe from "stripe";
import { claimStripeWebhookEvent } from "@/lib/billing/stripe-webhook-idempotency";
import {
  findOrganizationIdForSubscription,
  markSubscriptionCanceled,
  syncSubscriptionById,
} from "@/lib/billing/sync-subscription";

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
): Promise<{ duplicate: boolean; handled: boolean }> {
  const claim = await claimStripeWebhookEvent({
    stripeEventId: event.id,
    type: event.type,
  });
  if (claim.duplicate) {
    return { duplicate: true, handled: true };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (!subscriptionId) break;
      await syncSubscriptionById({
        subscriptionId,
        organizationId: session.metadata?.organizationId ?? null,
        checkoutSession: session,
      });
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscriptionById({
        subscriptionId: subscription.id,
        organizationId: subscription.metadata?.organizationId ?? null,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const synced = await syncSubscriptionById({
        subscriptionId: subscription.id,
        organizationId: subscription.metadata?.organizationId ?? null,
      });
      if (!synced) {
        const organizationId = await findOrganizationIdForSubscription({
          subscription,
        });
        if (organizationId) {
          await markSubscriptionCanceled({
            organizationId,
            subscriptionId: subscription.id,
          });
        }
      }
      break;
    }
    default:
      // Claimed for idempotency; no local side effects yet.
      break;
  }

  return { duplicate: false, handled: true };
}
