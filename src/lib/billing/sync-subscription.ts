/**
 * Sync OrganizationBillingProfile from a Stripe Subscription.
 * Mirrors the subscription's Price + discounts (not the env catalog price).
 */
import "server-only";

import type Stripe from "stripe";
import { applyPlanEntitlements } from "@/lib/billing/apply-plan-entitlements";
import {
  buildMirroredPriceDiscount,
  type MirroredCoupon,
} from "@/lib/billing/price-discount-mirror";
import {
  mapStripeSubscriptionStatus,
  resolvePlanCodeFromStripeIds,
} from "@/lib/billing/stripe-plan-mapping";
import { getStripe } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

export {
  mapStripeSubscriptionStatus,
  resolvePlanCodeFromStripeIds,
} from "@/lib/billing/stripe-plan-mapping";

function unixToDate(seconds: number | null | undefined): Date | null {
  if (seconds == null) return null;
  return new Date(seconds * 1000);
}

function extractCouponsFromSubscription(
  subscription: Stripe.Subscription,
): MirroredCoupon[] {
  const coupons: MirroredCoupon[] = [];
  for (const entry of subscription.discounts ?? []) {
    if (typeof entry === "string") continue;
    const raw = entry.source?.coupon;
    if (!raw || typeof raw === "string") continue;
    coupons.push({
      id: raw.id,
      percentOff: raw.percent_off,
      amountOffCents: raw.amount_off,
    });
  }
  return coupons;
}

function extractPrimaryItem(subscription: Stripe.Subscription): {
  priceId: string | null;
  productId: string | null;
  unitAmountCents: number | null;
  currency: string | null;
  interval: string | null;
  currentPeriodEnd: Date | null;
} {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const productRaw = price?.product;
  const productId =
    typeof productRaw === "string"
      ? productRaw
      : productRaw && !productRaw.deleted
        ? productRaw.id
        : null;

  return {
    priceId: price?.id ?? null,
    productId,
    unitAmountCents: price?.unit_amount ?? null,
    currency: price?.currency ?? subscription.currency ?? null,
    interval: price?.recurring?.interval ?? null,
    currentPeriodEnd: unixToDate(item?.current_period_end),
  };
}

export async function retrieveSubscriptionExpanded(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["discounts.source.coupon", "items.data.price.product"],
  });
}

export async function findOrganizationIdForSubscription(input: {
  subscription: Stripe.Subscription;
  checkoutSession?: Stripe.Checkout.Session | null;
}): Promise<string | null> {
  const fromMeta =
    input.subscription.metadata?.organizationId?.trim() ||
    input.checkoutSession?.metadata?.organizationId?.trim() ||
    null;
  if (fromMeta) return fromMeta;

  const customerId =
    typeof input.subscription.customer === "string"
      ? input.subscription.customer
      : input.subscription.customer?.id;

  if (customerId) {
    const byCustomer = await prisma.organizationBillingProfile.findFirst({
      where: { stripeCustomerId: customerId },
      select: { organizationId: true },
    });
    if (byCustomer) return byCustomer.organizationId;
  }

  const bySub = await prisma.organizationBillingProfile.findFirst({
    where: { stripeSubscriptionId: input.subscription.id },
    select: { organizationId: true },
  });
  return bySub?.organizationId ?? null;
}

export async function syncOrganizationFromStripeSubscription(input: {
  organizationId: string;
  subscription: Stripe.Subscription;
}): Promise<void> {
  const { organizationId, subscription } = input;
  const item = extractPrimaryItem(subscription);
  const coupons = extractCouponsFromSubscription(subscription);
  const mirror = buildMirroredPriceDiscount({
    priceId: item.priceId,
    productId: item.productId,
    unitAmountCents: item.unitAmountCents,
    currency: item.currency,
    interval: item.interval,
    coupons,
  });

  const billingStatus = mapStripeSubscriptionStatus(subscription.status);
  const planCode = resolvePlanCodeFromStripeIds({
    priceId: item.priceId,
    productId: item.productId,
  });

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  await prisma.organizationBillingProfile.upsert({
    where: { organizationId },
    create: {
      organizationId,
      planCode,
      billingStatus,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: mirror.stripePriceId,
      stripeProductId: mirror.stripeProductId,
      stripePriceUnitAmountCents: mirror.stripePriceUnitAmountCents,
      stripePriceCurrency: mirror.stripePriceCurrency,
      stripePriceInterval: mirror.stripePriceInterval,
      stripeDiscountPercentOff: mirror.stripeDiscountPercentOff,
      stripeDiscountAmountOffCents: mirror.stripeDiscountAmountOffCents,
      stripeCouponId: mirror.stripeCouponId,
      stripeEffectiveUnitAmountCents: mirror.stripeEffectiveUnitAmountCents,
      currentPeriodEnd: item.currentPeriodEnd,
      trialEndsAt: unixToDate(subscription.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: unixToDate(subscription.canceled_at),
    },
    update: {
      planCode,
      billingStatus,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: mirror.stripePriceId,
      stripeProductId: mirror.stripeProductId,
      stripePriceUnitAmountCents: mirror.stripePriceUnitAmountCents,
      stripePriceCurrency: mirror.stripePriceCurrency,
      stripePriceInterval: mirror.stripePriceInterval,
      stripeDiscountPercentOff: mirror.stripeDiscountPercentOff,
      stripeDiscountAmountOffCents: mirror.stripeDiscountAmountOffCents,
      stripeCouponId: mirror.stripeCouponId,
      stripeEffectiveUnitAmountCents: mirror.stripeEffectiveUnitAmountCents,
      currentPeriodEnd: item.currentPeriodEnd,
      trialEndsAt: unixToDate(subscription.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: unixToDate(subscription.canceled_at),
      // Clear lock when subscription is healthy again (lock enforcement later).
      ...(billingStatus === "ACTIVE" || billingStatus === "TRIALING"
        ? { lockReason: null, gracePeriodEndsAt: null }
        : {}),
    },
  });

  if (
    billingStatus === "TRIALING" ||
    billingStatus === "ACTIVE" ||
    billingStatus === "PAST_DUE"
  ) {
    await applyPlanEntitlements({ organizationId, planCode });
  }
}

export async function syncSubscriptionById(input: {
  subscriptionId: string;
  organizationId?: string | null;
  checkoutSession?: Stripe.Checkout.Session | null;
}): Promise<{ organizationId: string } | null> {
  const subscription = await retrieveSubscriptionExpanded(input.subscriptionId);
  const organizationId =
    input.organizationId ??
    (await findOrganizationIdForSubscription({
      subscription,
      checkoutSession: input.checkoutSession,
    }));
  if (!organizationId) return null;

  await syncOrganizationFromStripeSubscription({
    organizationId,
    subscription,
  });
  return { organizationId };
}

/** Prefer full syncOrganizationFromStripeSubscription; this is a fallback. */
export async function markSubscriptionCanceled(input: {
  organizationId: string;
  subscriptionId: string;
}): Promise<void> {
  const profile = await prisma.organizationBillingProfile.findFirst({
    where: {
      organizationId: input.organizationId,
      stripeSubscriptionId: input.subscriptionId,
    },
  });
  if (!profile) return;

  await prisma.organizationBillingProfile.update({
    where: { organizationId: input.organizationId },
    data: {
      billingStatus: "CANCELED",
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
      stripeDiscountPercentOff: null,
      stripeDiscountAmountOffCents: null,
      stripeCouponId: null,
      stripeEffectiveUnitAmountCents: profile.stripePriceUnitAmountCents,
    },
  });
}
