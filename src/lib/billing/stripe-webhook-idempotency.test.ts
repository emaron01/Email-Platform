import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

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

import {
  claimStripeWebhookEvent,
  isStripeWebhookEventClaimed,
} from "@/lib/billing/stripe-webhook-idempotency";

describe("stripe webhook idempotency (claim after success)", () => {
  beforeEach(() => {
    state.findUnique.mockReset();
    state.create.mockReset();
  });

  it("isStripeWebhookEventClaimed is read-only", async () => {
    state.findUnique.mockResolvedValue({ id: "row_1" });
    await expect(isStripeWebhookEventClaimed("evt_1")).resolves.toBe(true);
    state.findUnique.mockResolvedValue(null);
    await expect(isStripeWebhookEventClaimed("evt_2")).resolves.toBe(false);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("claimStripeWebhookEvent creates the success marker", async () => {
    state.create.mockResolvedValue({ id: "row_2" });
    await expect(
      claimStripeWebhookEvent({
        stripeEventId: "evt_2",
        type: "customer.subscription.deleted",
      }),
    ).resolves.toEqual({ ok: true, duplicate: false });
    expect(state.create).toHaveBeenCalled();
  });

  it("treats concurrent P2002 as duplicate claim", async () => {
    state.create.mockRejectedValue({ code: "P2002" });
    await expect(
      claimStripeWebhookEvent({
        stripeEventId: "evt_3",
        type: "customer.subscription.deleted",
      }),
    ).resolves.toEqual({ ok: true, duplicate: true });
  });

  it("handler claims only after side effects", () => {
    const webhook = readFileSync(
      "src/lib/billing/handle-stripe-webhook.ts",
      "utf8",
    );
    expect(webhook).toContain("isStripeWebhookEventClaimed");
    expect(webhook).toContain("claimStripeWebhookEvent");
    const checkIdx = webhook.indexOf("isStripeWebhookEventClaimed");
    const switchIdx = webhook.indexOf("switch (event.type)");
    const claimIdx = webhook.lastIndexOf("claimStripeWebhookEvent");
    expect(checkIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeLessThan(switchIdx);
    expect(claimIdx).toBeGreaterThan(switchIdx);
    expect(webhook).toMatch(/Claim only after side effects succeed/);
  });
});
