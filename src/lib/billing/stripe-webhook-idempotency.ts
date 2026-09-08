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
 * Inserts stripeEventId. Unique violation ⇒ already processed (safe no-op).
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
