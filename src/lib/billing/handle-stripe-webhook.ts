/**
 * Stripe webhook dispatcher — claim event id, then sync subscription state.
 * Never persist the raw event payload.
 */
import "server-only";

import type Stripe from "stripe";
import { claimStripeWebhookEvent } from "@/lib/billing/stripe-webhook-idempotency";
import { revalidateBillingUi } from "@/lib/billing/revalidate-billing-ui";
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

  let synced = false;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (!subscriptionId) break;
      const result = await syncSubscriptionById({
        subscriptionId,
        organizationId: session.metadata?.organizationId ?? null,
        checkoutSession: session,
      });
      synced = Boolean(result);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const result = await syncSubscriptionById({
        subscriptionId: subscription.id,
        organizationId: subscription.metadata?.organizationId ?? null,
      });
      synced = Boolean(result);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const result = await syncSubscriptionById({
        subscriptionId: subscription.id,
        organizationId: subscription.metadata?.organizationId ?? null,
      });
      if (!result) {
        const organizationId = await findOrganizationIdForSubscription({
          subscription,
        });
        if (organizationId) {
          await markSubscriptionCanceled({
            organizationId,
            subscriptionId: subscription.id,
          });
          synced = true;
        }
      } else {
        synced = true;
      }
      break;
    }
    default:
      break;
  }

  if (synced) {
    revalidateBillingUi();
  }

  return { duplicate: false, handled: true };
}
