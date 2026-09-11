import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRIAL_PERIOD_DAYS,
  MAX_TRIAL_PERIOD_DAYS,
  MIN_TRIAL_PERIOD_DAYS,
  resolveTrialPeriodDays,
} from "@/lib/billing/trial-period";

describe("resolveTrialPeriodDays", () => {
  const original = process.env.BILLING_TRIAL_PERIOD_DAYS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BILLING_TRIAL_PERIOD_DAYS;
    } else {
      process.env.BILLING_TRIAL_PERIOD_DAYS = original;
    }
    vi.restoreAllMocks();
  });

  it("defaults to 7 when unset or blank", () => {
    delete process.env.BILLING_TRIAL_PERIOD_DAYS;
    expect(resolveTrialPeriodDays()).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
    expect(resolveTrialPeriodDays("")).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
    expect(resolveTrialPeriodDays("   ")).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
  });

  it("accepts integers in 1–90", () => {
    expect(resolveTrialPeriodDays("1")).toBe(MIN_TRIAL_PERIOD_DAYS);
    expect(resolveTrialPeriodDays("14")).toBe(14);
    expect(resolveTrialPeriodDays(String(MAX_TRIAL_PERIOD_DAYS))).toBe(
      MAX_TRIAL_PERIOD_DAYS,
    );
  });

  it("turns trial off for 0 / off / false / none / disabled", () => {
    expect(resolveTrialPeriodDays("0")).toBeNull();
    expect(resolveTrialPeriodDays("off")).toBeNull();
    expect(resolveTrialPeriodDays("OFF")).toBeNull();
    expect(resolveTrialPeriodDays("false")).toBeNull();
    expect(resolveTrialPeriodDays("none")).toBeNull();
    expect(resolveTrialPeriodDays("disabled")).toBeNull();
  });

  it("rejects oversized and nonsensical values with fallback + warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(resolveTrialPeriodDays("1000")).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
    expect(resolveTrialPeriodDays("-3")).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
    expect(resolveTrialPeriodDays("7.5")).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
    expect(resolveTrialPeriodDays("abc")).toBe(DEFAULT_TRIAL_PERIOD_DAYS);

    expect(warn).toHaveBeenCalled();
  });

  it("is used by Checkout for new trials only (contract)", async () => {
    const { readFileSync } = await import("node:fs");
    const checkout = readFileSync(
      "src/lib/billing/create-checkout-session.ts",
      "utf8",
    );
    expect(checkout).toContain("resolveTrialPeriodDays");
    expect(checkout).toContain("trial_period_days");
    expect(checkout).not.toContain("plan?.trialDays ?? 7");
  });
});
