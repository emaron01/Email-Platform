/**
 * Stripe webhook idempotency — claim event id before side effects.
 * Never persist the raw Stripe payload.
 */
import "server-only";

import { prisma } from "@/lib/prisma";

export type WebhookClaimResult =
  | { ok: true; duplicate: false }
  | { ok: true; duplicate: true };

/**
 * Inserts stripeEventId. Already claimed ⇒ duplicate (safe no-op).
 * Prefers a read before create so Stripe retries do not spam prisma:error logs
 * for the unique constraint (P2002 is still caught for races).
 */
export async function claimStripeWebhookEvent(input: {
  stripeEventId: string;
  type: string;
}): Promise<WebhookClaimResult> {
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { stripeEventId: input.stripeEventId },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, duplicate: true };
  }

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
