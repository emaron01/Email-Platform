import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_PLAN_PREMIUM,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import {
  DEFAULT_TRIAL_PERIOD_DAYS,
  MAX_TRIAL_PERIOD_DAYS,
  MIN_TRIAL_PERIOD_DAYS,
  buildBillingTrialSetting,
  parseBillingTrialSetting,
  resolveEffectiveTrialPeriod,
  resolveTrialPeriodDays,
  trialPlanFormState,
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
});

describe("parseBillingTrialSetting / buildBillingTrialSetting", () => {
  it("accepts global enabled + days", () => {
    expect(parseBillingTrialSetting({ enabled: true, days: 14 })).toEqual({
      enabled: true,
      days: 14,
    });
  });

  it("accepts byPlan overrides alongside days", () => {
    expect(
      parseBillingTrialSetting({
        enabled: true,
        days: 14,
        byPlan: { PREMIUM: 30 },
      }),
    ).toEqual({
      enabled: true,
      days: 14,
      byPlan: { PREMIUM: 30 },
    });
  });

  it("accepts independent Standard / Team plans", () => {
    expect(
      parseBillingTrialSetting({
        enabled: true,
        days: 7,
        plans: {
          STANDARD: { enabled: true, days: 7 },
          TEAM: { enabled: false },
        },
      }),
    ).toEqual({
      enabled: true,
      days: 7,
      plans: {
        STANDARD: { enabled: true, days: 7 },
        TEAM: { enabled: false },
      },
    });
  });

  it("rejects enabled without days, byPlan, or plans", () => {
    expect(parseBillingTrialSetting({ enabled: true })).toBeNull();
  });

  it("rejects out-of-range days", () => {
    expect(parseBillingTrialSetting({ enabled: true, days: 0 })).toBeNull();
    expect(parseBillingTrialSetting({ enabled: true, days: 91 })).toBeNull();
  });

  it("builds per-plan controls and preserves unrelated byPlan keys", () => {
    expect(
      buildBillingTrialSetting({
        standard: { enabled: true, days: 7 },
        team: { enabled: false, days: 14 },
        existingByPlan: { PREMIUM: 30, TEAM: 99 },
      }),
    ).toEqual({
      enabled: true,
      days: 7,
      byPlan: { PREMIUM: 30 },
      plans: {
        STANDARD: { enabled: true, days: 7 },
        TEAM: { enabled: false },
      },
    });
  });
});

describe("resolveEffectiveTrialPeriod", () => {
  const original = process.env.BILLING_TRIAL_PERIOD_DAYS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BILLING_TRIAL_PERIOD_DAYS;
    } else {
      process.env.BILLING_TRIAL_PERIOD_DAYS = original;
    }
    vi.restoreAllMocks();
  });

  it("falls back to environment when no console row", () => {
    delete process.env.BILLING_TRIAL_PERIOD_DAYS;
    const result = resolveEffectiveTrialPeriod({
      planCode: BILLING_PLAN_STANDARD,
      platformSetting: null,
    });
    expect(result.days).toBe(DEFAULT_TRIAL_PERIOD_DAYS);
    expect(result.source).toBe("environment");
  });

  it("uses platform global days over env", () => {
    const result = resolveEffectiveTrialPeriod({
      planCode: BILLING_PLAN_STANDARD,
      platformSetting: { enabled: true, days: 14 },
      envRaw: "7",
    });
    expect(result).toMatchObject({
      days: 14,
      source: "platform",
      sourceLabel: "platform console",
    });
  });

  it("prefers byPlan override then global days", () => {
    const setting = {
      enabled: true,
      days: 14,
      byPlan: { PREMIUM: 30 },
    };
    expect(
      resolveEffectiveTrialPeriod({
        planCode: BILLING_PLAN_PREMIUM,
        platformSetting: setting,
        envRaw: "7",
      }).days,
    ).toBe(30);
    expect(
      resolveEffectiveTrialPeriod({
        planCode: BILLING_PLAN_STANDARD,
        platformSetting: setting,
        envRaw: "7",
      }).days,
    ).toBe(14);
  });

  it("allows Team trial off while Standard stays on", () => {
    const setting = buildBillingTrialSetting({
      standard: { enabled: true, days: 7 },
      team: { enabled: false, days: 7 },
    });
    expect(
      resolveEffectiveTrialPeriod({
        planCode: BILLING_PLAN_STANDARD,
        platformSetting: setting,
        envRaw: "14",
      }).days,
    ).toBe(7);
    expect(
      resolveEffectiveTrialPeriod({
        planCode: BILLING_PLAN_TEAM,
        platformSetting: setting,
        envRaw: "14",
      }).days,
    ).toBeNull();
  });

  it("platform enabled:false turns trial off without reading env", () => {
    const result = resolveEffectiveTrialPeriod({
      planCode: BILLING_PLAN_STANDARD,
      platformSetting: { enabled: false },
      envRaw: "14",
    });
    expect(result.days).toBeNull();
    expect(result.source).toBe("platform");
  });

  it("is used by Checkout for new trials only (contract)", async () => {
    const { readFileSync } = await import("node:fs");
    const checkout = readFileSync(
      "src/lib/billing/create-checkout-session.ts",
      "utf8",
    );
    expect(checkout).toContain("loadEffectiveTrialPeriod");
    expect(checkout).toContain("trial_period_days");
    expect(checkout).not.toContain("plan?.trialDays ?? 7");
  });
});

describe("trialPlanFormState", () => {
  it("maps legacy global row onto both plans", () => {
    expect(
      trialPlanFormState({
        platformSetting: { enabled: true, days: 10 },
        standardEffectiveDays: 10,
        teamEffectiveDays: 10,
      }),
    ).toEqual({
      standard: { enabled: true, days: 10 },
      team: { enabled: true, days: 10 },
    });
  });

  it("reads independent plans when present", () => {
    expect(
      trialPlanFormState({
        platformSetting: {
          enabled: true,
          days: 7,
          plans: {
            STANDARD: { enabled: true, days: 7 },
            TEAM: { enabled: false },
          },
        },
        standardEffectiveDays: 7,
        teamEffectiveDays: null,
      }),
    ).toEqual({
      standard: { enabled: true, days: 7 },
      team: { enabled: false, days: 7 },
    });
  });
});
