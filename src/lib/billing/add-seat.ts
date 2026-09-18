/**
 * Increment / decrement seat quantity on Team Stripe subscription,
 * with confirmation preview (monthly total + estimated proration on add).
 *
 * Add: immediate with create_prorations (charge today for remaining period).
 * Remove: quantity and invite capacity drop immediately; proration_behavior
 * none — no mid-cycle credit. Lower charge applies on the next invoice.
 */
import "server-only";

import { BILLING_PLAN_TEAM, getPlanDefinition, planUsesSeatBilling } from "@/lib/billing/plans";
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
  /**
   * Add: estimated charge due now from proration (positive).
   * Remove: always 0 — no mid-cycle credit; reduction hits next bill.
   */
  prorationAmountCents: number;
  /** Full seat unit amount removed from the next invoice (remove only; else 0). */
  nextBillDeltaCents: number;
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

/** Accounting-style negative money: ($12.00) */
export function formatMoneyParenthetical(
  amountCents: number,
  currency: string,
): string {
  return `(${formatStripeMoney(Math.abs(amountCents), currency)})`;
}

/** Pure preview copy — kept testable without Stripe. */
export function buildSeatChangeSummaryLines(input: {
  direction: SeatChangeDirection;
  nextSeats: number;
  unitAmountCents: number;
  nextMonthlyTotalCents: number;
  /** Add only: prorated charge today. Ignored for remove. */
  prorationAmountCents: number;
  currency: string;
  interval: string;
  periodEnd: Date | null;
  /** TEAM: companies researched per seat/user. */
  companiesPerSeat?: number | null;
}): string[] {
  const money = (cents: number) => formatStripeMoney(cents, input.currency);
  const renewalLabel = input.periodEnd
    ? input.periodEnd.toISOString().slice(0, 10)
    : "next cycle";

  if (input.direction === "add") {
    return [
      `New monthly total: ${money(input.nextMonthlyTotalCents)} / ${input.interval} (${input.nextSeats} seats × ${money(input.unitAmountCents)}).`,
      `Estimated charge today (proration): ${money(Math.max(0, input.prorationAmountCents))}.`,
      `At renewal (${renewalLabel}): ${money(input.nextMonthlyTotalCents)}.`,
      ...(input.companiesPerSeat != null
        ? [
            `Each seat includes ${input.companiesPerSeat} company research slots for that user (${input.companiesPerSeat * input.nextSeats} total across ${input.nextSeats} seats).`,
          ]
        : []),
    ];
  }

  return [
    `This seat and its invite capacity end immediately (${input.nextSeats + 1} → ${input.nextSeats} seats).`,
    `No credit for the rest of this billing period — you already paid for this seat through ${renewalLabel}.`,
    `Next invoice (${renewalLabel}): ${money(input.nextMonthlyTotalCents)} / ${input.interval} (${input.nextSeats} seats × ${money(input.unitAmountCents)}; seat charge removed ${formatMoneyParenthetical(input.unitAmountCents, input.currency)}).`,
  ];
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

  // Stripe quantity is source of truth; heal a drifted local row for the preview.
  const current = Math.max(1, ctx.item.quantity ?? ctx.profile.seatQuantity);
  if (current !== ctx.profile.seatQuantity) {
    await prisma.organizationBillingProfile.update({
      where: { organizationId: input.organizationId },
      data: { seatQuantity: current },
    });
  }

  const nextRes = resolveNextSeats({
    direction: input.direction,
    current,
    maxSeats: ctx.profile.maxSeats,
    planCode: ctx.profile.planCode,
    usedSeats: input.usedSeats,
  });
  if (!nextRes.ok) return nextRes;

  const periodStart =
    (ctx.item as { current_period_start?: number }).current_period_start ??
    (ctx.subscription as { current_period_start?: number })
      .current_period_start ??
    Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const periodEndUnix =
    (ctx.item as { current_period_end?: number }).current_period_end ??
    (ctx.subscription as { current_period_end?: number }).current_period_end ??
    null;
  const periodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000)
    : ctx.profile.currentPeriodEnd;

  const nextMonthlyTotalCents = ctx.unitAmountCents * nextRes.next;

  // Add: prorate remaining period. Remove: no mid-cycle credit.
  const prorationAmountCents =
    input.direction === "add"
      ? Math.round(
          ctx.unitAmountCents *
            (nextRes.next - current) *
            periodFraction({
              periodStart,
              periodEnd:
                periodEndUnix ??
                Math.floor(
                  (ctx.profile.currentPeriodEnd?.getTime() ?? Date.now()) /
                    1000,
                ),
            }),
        )
      : 0;
  const nextBillDeltaCents =
    input.direction === "remove" ? -ctx.unitAmountCents : 0;

  const companiesPerSeat =
    getPlanDefinition(ctx.profile.planCode)?.seats.companiesPerSeat ?? null;

  const summaryLines = buildSeatChangeSummaryLines({
    direction: input.direction,
    nextSeats: nextRes.next,
    unitAmountCents: ctx.unitAmountCents,
    nextMonthlyTotalCents,
    prorationAmountCents,
    currency: ctx.currency,
    interval: ctx.interval,
    periodEnd,
    companiesPerSeat,
  });

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
      nextBillDeltaCents,
      currentPeriodEnd: periodEnd,
      summaryLines,
    },
  };
}

/**
 * Claim the next seatQuantity in DB (optimistic lock), then update Stripe.
 * Concurrent changes lose the claim and return CONCURRENT_SEAT_CHANGE.
 * Stripe failure rolls the claim back so local stays aligned.
 */
async function applySeatQuantity(input: {
  organizationId: string;
  nextSeats: number;
  direction: SeatChangeDirection;
  expectedCurrentSeats: number;
}): Promise<SeatChangeResult> {
  const ctx = await loadSeatChangeContext(input.organizationId);
  if (!ctx.ok) return ctx;

  const stripeQty = Math.max(1, ctx.item.quantity ?? ctx.profile.seatQuantity);
  if (stripeQty !== input.expectedCurrentSeats) {
    if (ctx.profile.seatQuantity !== stripeQty) {
      await prisma.organizationBillingProfile.update({
        where: { organizationId: input.organizationId },
        data: { seatQuantity: stripeQty },
      });
    }
    return {
      ok: false,
      error: "Seat count changed. Refresh and try again.",
      code: "CONCURRENT_SEAT_CHANGE",
    };
  }

  const claimed = await prisma.organizationBillingProfile.updateMany({
    where: {
      organizationId: input.organizationId,
      seatQuantity: input.expectedCurrentSeats,
      stripeSubscriptionId: ctx.profile.stripeSubscriptionId,
    },
    data: { seatQuantity: input.nextSeats },
  });
  if (claimed.count !== 1) {
    return {
      ok: false,
      error: "Seat count changed. Refresh and try again.",
      code: "CONCURRENT_SEAT_CHANGE",
    };
  }

  const stripe = getStripe();
  try {
    await stripe.subscriptions.update(ctx.profile.stripeSubscriptionId!, {
      items: [{ id: ctx.item.id, quantity: input.nextSeats }],
      // Add: charge remaining period now. Remove: no credit; next invoice is lower.
      proration_behavior:
        input.direction === "add" ? "create_prorations" : "none",
      metadata: {
        ...ctx.subscription.metadata,
        seatQuantity: String(input.nextSeats),
        planCode: ctx.profile.planCode || BILLING_PLAN_TEAM,
      },
    });
  } catch (error) {
    await prisma.organizationBillingProfile.updateMany({
      where: {
        organizationId: input.organizationId,
        seatQuantity: input.nextSeats,
      },
      data: { seatQuantity: input.expectedCurrentSeats },
    });
    const message =
      error instanceof Error ? error.message : "Stripe could not update seats.";
    return {
      ok: false,
      error: message,
      code: "STRIPE_UPDATE_FAILED",
    };
  }

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
    direction: "add",
    expectedCurrentSeats: preview.preview.currentSeats,
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
    direction: "remove",
    expectedCurrentSeats: preview.preview.currentSeats,
  });
}
