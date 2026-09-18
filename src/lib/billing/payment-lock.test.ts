import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isPaymentLocked,
  isSpendBlocked,
  isPastDueInGrace,
  nextPaymentLockFields,
  paymentLockUserMessage,
  PAYMENT_LOCK_GRACE_MS,
} from "@/lib/billing/payment-lock";
import { BILLING_PLAN_COMPED, BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

describe("isPaymentLocked entitlement matrix", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("allows FREE / COMPED, ACTIVE, TRIALING", () => {
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_COMPED,
          billingStatus: "FREE",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "ACTIVE",
          stripeSubscriptionId: "sub_x",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "TRIALING",
          stripeSubscriptionId: "sub_x",
        },
        now,
      ),
    ).toBe(false);
  });

  it("locks CANCELED immediately (even without lockReason)", () => {
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "CANCELED",
          stripeSubscriptionId: "sub_x",
          lockReason: null,
          gracePeriodEndsAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("does not lock pre-checkout UNPAID; locks Stripe-mapped UNPAID with sub id", () => {
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "UNPAID",
          stripeSubscriptionId: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "UNPAID",
          stripeSubscriptionId: "sub_x",
        },
        now,
      ),
    ).toBe(true);
  });

  it("PAST_DUE grace is read-only: writes blocked, routes open until grace ends", () => {
    const inGrace = {
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "PAST_DUE" as const,
      stripeSubscriptionId: "sub_x",
      lockReason: "PAYMENT_FAILED" as const,
      gracePeriodEndsAt: new Date("2026-09-28T12:00:00.000Z"),
    };
    expect(isPastDueInGrace(inGrace, now)).toBe(true);
    expect(isPaymentLocked(inGrace, now)).toBe(false);
    expect(isSpendBlocked(inGrace, now)).toBe(true);

    const afterGrace = {
      ...inGrace,
      gracePeriodEndsAt: new Date("2026-09-10T12:00:00.000Z"),
    };
    expect(isPastDueInGrace(afterGrace, now)).toBe(false);
    expect(isPaymentLocked(afterGrace, now)).toBe(true);
    expect(isSpendBlocked(afterGrace, now)).toBe(true);

    // Grace not written yet — still in grace (heal starts the clock); writes blocked.
    const pendingGrace = {
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "PAST_DUE" as const,
      stripeSubscriptionId: "sub_x",
      gracePeriodEndsAt: null,
    };
    expect(isPaymentLocked(pendingGrace, now)).toBe(false);
    expect(isSpendBlocked(pendingGrace, now)).toBe(true);
  });
});

describe("nextPaymentLockFields", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("clears lock on ACTIVE/TRIALING", () => {
    expect(
      nextPaymentLockFields({
        previous: {
          billingStatus: "CANCELED",
          lockReason: "CANCELED",
          gracePeriodEndsAt: null,
        },
        billingStatus: "ACTIVE",
        now,
      }),
    ).toEqual({ lockReason: null, gracePeriodEndsAt: null });
  });

  it("sets CANCELED lock with no grace", () => {
    expect(
      nextPaymentLockFields({
        previous: {
          billingStatus: "ACTIVE",
          lockReason: null,
          gracePeriodEndsAt: null,
        },
        billingStatus: "CANCELED",
        now,
      }),
    ).toEqual({ lockReason: "CANCELED", gracePeriodEndsAt: null });
  });

  it("starts PAST_DUE grace once and preserves it on later syncs", () => {
    const first = nextPaymentLockFields({
      previous: {
        billingStatus: "ACTIVE",
        lockReason: null,
        gracePeriodEndsAt: null,
      },
      billingStatus: "PAST_DUE",
      now,
    });
    expect(first.lockReason).toBe("PAYMENT_FAILED");
    expect(first.gracePeriodEndsAt?.getTime()).toBe(
      now.getTime() + PAYMENT_LOCK_GRACE_MS,
    );
    expect(PAYMENT_LOCK_GRACE_MS).toBe(14 * 24 * 60 * 60 * 1000);

    const later = new Date("2026-09-16T12:00:00.000Z");
    const second = nextPaymentLockFields({
      previous: {
        billingStatus: "PAST_DUE",
        lockReason: "PAYMENT_FAILED",
        gracePeriodEndsAt: first.gracePeriodEndsAt,
      },
      billingStatus: "PAST_DUE",
      now: later,
    });
    expect(second.gracePeriodEndsAt?.getTime()).toBe(
      first.gracePeriodEndsAt?.getTime(),
    );
  });
});

describe("paymentLockUserMessage", () => {
  it("mentions billing for canceled orgs", () => {
    expect(
      paymentLockUserMessage({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
      }),
    ).toMatch(/Billing/i);
  });

  it("describes full read-only during PAST_DUE grace", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    expect(
      paymentLockUserMessage(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "PAST_DUE",
          gracePeriodEndsAt: new Date("2026-09-28T12:00:00.000Z"),
        },
        now,
      ),
    ).toMatch(/read-only/i);
  });
});

describe("payment lock route gate", () => {
  it("runs in app layout after checkout gate", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain("enforcePaymentLockGate");
    expect(layout.indexOf("enforcePaymentLockGate")).toBeGreaterThan(
      layout.indexOf("enforceSelfServeCheckoutGate"),
    );
  });

  it("redirects locked orgs to billing only", () => {
    const gate = readFileSync("src/lib/billing/payment-lock-gate.ts", "utf8");
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");
    expect(gate).toContain('redirect("/settings/billing")');
    expect(lock).toContain("PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES");
    expect(lock).toContain('"/settings/billing"');
    // Must stay open while locked or billing↔EULA redirect-loops.
    expect(lock).toContain('"/onboarding/eula"');
  });

  it("grace refuses Server Actions without redirecting views", () => {
    const gate = readFileSync("src/lib/billing/payment-lock-gate.ts", "utf8");
    const org = readFileSync(
      "src/lib/tenant/getCurrentOrganization.ts",
      "utf8",
    );
    expect(gate).toContain("NEXT_ACTION_HEADER");
    expect(gate).toContain("PaymentLockError");
    expect(org).toContain("NEXT_ACTION_HEADER");
    expect(org).toContain("assertOrganizationNotPaymentLocked");
  });

  it("assert uses spendBlocked so PAST_DUE grace cannot write or research", () => {
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");
    expect(lock).toContain("spendBlocked");
    expect(lock).toContain("isSpendBlocked");
    expect(lock).toContain("isWritesBlocked");
  });
});
