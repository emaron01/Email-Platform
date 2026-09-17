/**
 * Increment / decrement seat quantity on Team Stripe subscription,
 * with confirmation preview (monthly total + estimated proration).
 */
import "server-only";

import { BILLING_PLAN_TEAM, planUsesSeatBilling } from "@/lib/billing/plans";
import { formatStripeMoney } from "@/lib/billing/billing-state";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { retrieveSubscriptionExpanded } from "@/lib/billing/sync-subscription";
import {
  SEAT_LIMIT_REACHED_MESSAGE,
  clampSeatQuantity,
  defaultSeatQuantityForPlan,
} from "@/lib/org/seat-limits";
import { prisma } from "@/lib/prisma";

export type SeatChangeDirection = "add" | "remove";

export type SeatChangePreview = {
  direction: SeatChangeDirection;
  currentSeats: number;
  nextSeats: number;
  unitAmountCents: number;
  currency: string;
  interval: string;
  /** Recurring total after change (list/effective per seat × seats). */
  nextMonthlyTotalCents: number;
  /** Estimated charge (add) or credit (remove) due now from proration. */
  prorationAmountCents: number;
  currentPeriodEnd: Date | null;
  summaryLines: string[];
};

export type SeatChangeResult =
  | { ok: true; seatQuantity: number }
  | { ok: false; error: string; code: string };

export type SeatPreviewResult =
  | { ok: true; preview: SeatChangePreview }
  | { ok: false; error: string; code: string };

function periodFraction(input: {
  periodStart: number;
  periodEnd: number;
  nowMs?: number;
}): number {
  const now = input.nowMs ?? Date.now();
  const startMs = input.periodStart * 1000;
  const endMs = input.periodEnd * 1000;
  const total = Math.max(1, endMs - startMs);
  const remaining = Math.max(0, endMs - now);
  return Math.min(1, remaining / total);
}

async function loadSeatChangeContext(organizationId: string) {
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
  });
  if (!profile?.stripeSubscriptionId) {
    return {
      ok: false as const,
      error: "No active subscription to change seats on.",
      code: "NO_SUBSCRIPTION",
    };
  }
  if (!planUsesSeatBilling(profile.planCode)) {
    return {
      ok: false as const,
      error: "Seat changes are only available on Team plans.",
      code: "PLAN_NOT_ELIGIBLE",
    };
  }
  if (!stripeConfigured()) {
    return {
      ok: false as const,
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const subscription = await retrieveSubscriptionExpanded(
    profile.stripeSubscriptionId,
  );
  const item = subscription.items.data[0];
  if (!item) {
    return {
      ok: false as const,
      error: "Subscription has no line items.",
      code: "NO_LINE_ITEM",
    };
  }

  const unitAmountCents =
    profile.stripeEffectiveUnitAmountCents ??
    profile.stripePriceUnitAmountCents ??
    item.price?.unit_amount ??
    0;
  const currency =
    profile.stripePriceCurrency ?? item.price?.currency ?? "usd";
  const interval =
    profile.stripePriceInterval ??
    item.price?.recurring?.interval ??
    "month";

  return {
    ok: true as const,
    profile,
    subscription,
    item,
    unitAmountCents,
    currency,
    interval,
  };
}

function resolveNextSeats(input: {
  direction: SeatChangeDirection;
  current: number;
  maxSeats: number;
  planCode: string;
  usedSeats: number;
}): { ok: true; next: number } | { ok: false; error: string; code: string } {
  const minSeats = defaultSeatQuantityForPlan(input.planCode);
  if (input.direction === "add") {
    const next = input.current + 1;
    if (next > input.maxSeats) {
      return { ok: false, error: SEAT_LIMIT_REACHED_MESSAGE, code: "SEAT_CAP" };
    }
    const clamped = clampSeatQuantity({
      planCode: input.planCode,
      quantity: next,
      maxSeats: input.maxSeats,
    });
    if (clamped <= input.current) {
      return { ok: false, error: SEAT_LIMIT_REACHED_MESSAGE, code: "SEAT_CAP" };
    }
    return { ok: true, next: clamped };
  }

  const next = input.current - 1;
  if (next < minSeats) {
    return {
      ok: false,
      error: `Team plans require at least ${minSeats} seats.`,
      code: "SEAT_FLOOR",
    };
  }
  if (next < input.usedSeats) {
    return {
      ok: false,
      error: `You have ${input.usedSeats} active members. Remove members before reducing seats.`,
      code: "SEATS_IN_USE",
    };
  }
  return { ok: true, next };
}

export async function previewSeatChange(input: {
  organizationId: string;
  direction: SeatChangeDirection;
  usedSeats: number;
}): Promise<SeatPreviewResult> {
  const ctx = await loadSeatChangeContext(input.organizationId);
  if (!ctx.ok) return ctx;

  const current = ctx.profile.seatQuantity;
  const nextRes = resolveNextSeats({
    direction: input.direction,
    current,
    maxSeats: ctx.profile.maxSeats,
    planCode: ctx.profile.planCode,
    usedSeats: input.usedSeats,
  });
  if (!nextRes.ok) return nextRes;

  const delta = nextRes.next - current;
  const fraction = periodFraction({
    periodStart:
      // Stripe API: period fields may live on the item (newer) or subscription.
      (ctx.item as { current_period_start?: number }).current_period_start ??
      (ctx.subscription as { current_period_start?: number })
        .current_period_start ??
      Math.floor(Date.now() / 1000) - 30 * 24 * 3600,
    periodEnd:
      (ctx.item as { current_period_end?: number }).current_period_end ??
      (ctx.subscription as { current_period_end?: number }).current_period_end ??
      Math.floor(
        (ctx.profile.currentPeriodEnd?.getTime() ?? Date.now()) / 1000,
      ),
  });
  const prorationAmountCents = Math.round(
    ctx.unitAmountCents * delta * fraction,
  );
  const nextMonthlyTotalCents = ctx.unitAmountCents * nextRes.next;
  const periodEndUnix =
    (ctx.item as { current_period_end?: number }).current_period_end ??
    (ctx.subscription as { current_period_end?: number }).current_period_end ??
    null;
  const periodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000)
    : ctx.profile.currentPeriodEnd;

  const money = (cents: number) => formatStripeMoney(cents, ctx.currency);
  const summaryLines =
    input.direction === "add"
      ? [
          `New monthly total: ${money(nextMonthlyTotalCents)} / ${ctx.interval} (${nextRes.next} seats × ${money(ctx.unitAmountCents)}).`,
          `Estimated charge today (proration): ${money(Math.max(0, prorationAmountCents))}.`,
          `At renewal (${periodEnd ? periodEnd.toISOString().slice(0, 10) : "next cycle"}): ${money(nextMonthlyTotalCents)}.`,
        ]
      : [
          `New monthly total: ${money(nextMonthlyTotalCents)} / ${ctx.interval} (${nextRes.next} seats × ${money(ctx.unitAmountCents)}).`,
          `Estimated credit today (proration): ${money(Math.abs(Math.min(0, prorationAmountCents)))}.`,
          `At renewal (${periodEnd ? periodEnd.toISOString().slice(0, 10) : "next cycle"}): ${money(nextMonthlyTotalCents)}.`,
        ];

  return {
    ok: true,
    preview: {
      direction: input.direction,
      currentSeats: current,
      nextSeats: nextRes.next,
      unitAmountCents: ctx.unitAmountCents,
      currency: ctx.currency,
      interval: ctx.interval,
      nextMonthlyTotalCents,
      prorationAmountCents,
      currentPeriodEnd: periodEnd,
      summaryLines,
    },
  };
}

async function applySeatQuantity(input: {
  organizationId: string;
  nextSeats: number;
}): Promise<SeatChangeResult> {
  const ctx = await loadSeatChangeContext(input.organizationId);
  if (!ctx.ok) return ctx;

  const stripe = getStripe();
  await stripe.subscriptions.update(ctx.profile.stripeSubscriptionId!, {
    items: [{ id: ctx.item.id, quantity: input.nextSeats }],
    proration_behavior: "create_prorations",
    metadata: {
      ...ctx.subscription.metadata,
      seatQuantity: String(input.nextSeats),
      planCode: ctx.profile.planCode || BILLING_PLAN_TEAM,
    },
  });

  await prisma.organizationBillingProfile.update({
    where: { organizationId: input.organizationId },
    data: { seatQuantity: input.nextSeats },
  });

  return { ok: true, seatQuantity: input.nextSeats };
}

export async function addSeatToSubscription(input: {
  organizationId: string;
  usedSeats?: number;
}): Promise<SeatChangeResult> {
  const usedSeats = input.usedSeats ?? 0;
  const preview = await previewSeatChange({
    organizationId: input.organizationId,
    direction: "add",
    usedSeats,
  });
  if (!preview.ok) return preview;
  return applySeatQuantity({
    organizationId: input.organizationId,
    nextSeats: preview.preview.nextSeats,
  });
}

export async function removeSeatFromSubscription(input: {
  organizationId: string;
  usedSeats: number;
}): Promise<SeatChangeResult> {
  const preview = await previewSeatChange({
    organizationId: input.organizationId,
    direction: "remove",
    usedSeats: input.usedSeats,
  });
  if (!preview.ok) return preview;
  return applySeatQuantity({
    organizationId: input.organizationId,
    nextSeats: preview.preview.nextSeats,
  });
}
