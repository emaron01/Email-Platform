/**
 * Stripe webhook idempotency — persist event id only after side effects succeed.
 * Never persist the raw Stripe payload.
 *
 * Flow:
 * 1. isStripeWebhookEventClaimed → if yes, skip (successful prior delivery)
 * 2. Run handler side effects (must be idempotent)
 * 3. claimStripeWebhookEvent → record success
 *
 * A failed handler leaves the event unclaimed so Stripe retries re-apply.
 * Concurrent in-flight deliveries may both apply once; upserts / unique
 * grant keys make that safe; the second claim hits P2002 and is treated as OK.
 */
import "server-only";

import { prisma } from "@/lib/prisma";

export type WebhookClaimResult =
  | { ok: true; duplicate: false }
  | { ok: true; duplicate: true };

/** Read-only: true when a prior delivery already completed successfully. */
export async function isStripeWebhookEventClaimed(
  stripeEventId: string,
): Promise<boolean> {
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { stripeEventId },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * Record that this event finished successfully.
 * P2002 = concurrent twin already claimed after its own successful apply.
 */
export async function claimStripeWebhookEvent(input: {
  stripeEventId: string;
  type: string;
}): Promise<WebhookClaimResult> {
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: input.stripeEventId,
        type: input.type,
      },
    });
    return { ok: true, duplicate: false };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    if (code === "P2002") {
      return { ok: true, duplicate: true };
    }
    throw error;
  }
}
