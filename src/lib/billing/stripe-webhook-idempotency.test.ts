import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      findUnique: state.findUnique,
      create: state.create,
    },
  },
}));

import { claimStripeWebhookEvent } from "@/lib/billing/stripe-webhook-idempotency";

describe("claimStripeWebhookEvent", () => {
  beforeEach(() => {
    state.findUnique.mockReset();
    state.create.mockReset();
  });

  it("returns duplicate without create when event already claimed", async () => {
    state.findUnique.mockResolvedValue({ id: "row_1" });
    await expect(
      claimStripeWebhookEvent({
        stripeEventId: "evt_1",
        type: "customer.subscription.deleted",
      }),
    ).resolves.toEqual({ ok: true, duplicate: true });
    expect(state.create).not.toHaveBeenCalled();
  });

  it("creates when new", async () => {
    state.findUnique.mockResolvedValue(null);
    state.create.mockResolvedValue({ id: "row_2" });
    await expect(
      claimStripeWebhookEvent({
        stripeEventId: "evt_2",
        type: "customer.subscription.deleted",
      }),
    ).resolves.toEqual({ ok: true, duplicate: false });
    expect(state.create).toHaveBeenCalled();
  });

  it("treats concurrent P2002 as duplicate", async () => {
    state.findUnique.mockResolvedValue(null);
    state.create.mockRejectedValue({ code: "P2002" });
    await expect(
      claimStripeWebhookEvent({
        stripeEventId: "evt_3",
        type: "customer.subscription.deleted",
      }),
    ).resolves.toEqual({ ok: true, duplicate: true });
  });
});
