/**
 * Trial length for NEW STANDARD (and future sellable) Checkout sessions.
 *
 * Resolution order for a plan:
 *   1. PlatformSetting "billing.trial" (console) — byPlan[plan] → days → off
 *   2. BILLING_TRIAL_PERIOD_DAYS env (fallback when no console row)
 *   3. Default 7 / off tokens
 *
 * Does not change subscriptions already created in Stripe.
 */

import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

export const DEFAULT_TRIAL_PERIOD_DAYS = 7;
/** Inclusive bounds for an active trial — thousand-day misconfigs fall back. */
export const MIN_TRIAL_PERIOD_DAYS = 1;
export const MAX_TRIAL_PERIOD_DAYS = 90;

export const PLATFORM_SETTING_BILLING_TRIAL = "billing.trial";

const ENV_NAME = "BILLING_TRIAL_PERIOD_DAYS";

const OFF_TOKENS = new Set(["0", "off", "false", "none", "disabled"]);

/**
 * Console payload for billing.trial.
 * Global `days` applies to all plans; optional byPlan overrides (future Premium UI).
 */
export type BillingTrialSettingValue = {
  enabled: boolean;
  /** Global days when enabled; required when enabled and no byPlan-only use. */
  days?: number;
  /** Optional per-plan overrides, e.g. { PREMIUM: 30 }. */
  byPlan?: Record<string, number>;
};

export type TrialPeriodSource = "platform" | "environment";

export type EffectiveTrialPeriod = {
  /** null = trial off for new Checkout */
  days: number | null;
  source: TrialPeriodSource;
  sourceLabel: string;
};

function isValidTrialDays(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= MIN_TRIAL_PERIOD_DAYS &&
    n <= MAX_TRIAL_PERIOD_DAYS
  );
}

/**
 * Parse/validate console JSON. Returns null if missing or malformed
 * (caller falls back to environment).
 */
export function parseBillingTrialSetting(
  raw: unknown,
): BillingTrialSettingValue | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.enabled !== "boolean") return null;

  const result: BillingTrialSettingValue = { enabled: obj.enabled };

  if (obj.days !== undefined) {
    if (!isValidTrialDays(obj.days)) return null;
    result.days = obj.days;
  }

  if (obj.byPlan !== undefined) {
    if (
      !obj.byPlan ||
      typeof obj.byPlan !== "object" ||
      Array.isArray(obj.byPlan)
    ) {
      return null;
    }
    const byPlan: Record<string, number> = {};
    for (const [plan, days] of Object.entries(
      obj.byPlan as Record<string, unknown>,
    )) {
      if (!plan.trim()) return null;
      if (!isValidTrialDays(days)) return null;
      byPlan[plan] = days;
    }
    result.byPlan = byPlan;
  }

  if (result.enabled && result.days == null && !result.byPlan) {
    return null;
  }

  return result;
}

/** Build a validated payload for upsert from the global console controls. */
export function buildBillingTrialSetting(input: {
  enabled: boolean;
  days: number;
  /** Preserve existing byPlan when saving global controls. */
  existingByPlan?: Record<string, number>;
}): BillingTrialSettingValue {
  if (!input.enabled) {
    const value: BillingTrialSettingValue = { enabled: false };
    if (input.existingByPlan && Object.keys(input.existingByPlan).length > 0) {
      value.byPlan = input.existingByPlan;
    }
    return value;
  }
  if (!isValidTrialDays(input.days)) {
    throw new Error(
      `Trial days must be an integer from ${MIN_TRIAL_PERIOD_DAYS} to ${MAX_TRIAL_PERIOD_DAYS}.`,
    );
  }
  const value: BillingTrialSettingValue = {
    enabled: true,
    days: input.days,
  };
  if (input.existingByPlan && Object.keys(input.existingByPlan).length > 0) {
    value.byPlan = input.existingByPlan;
  }
  return value;
}

function resolveFromPlatformSetting(
  setting: BillingTrialSettingValue,
  planCode: string,
): number | null | "invalid" {
  if (!setting.enabled) return null;

  const planOverride = setting.byPlan?.[planCode];
  if (planOverride !== undefined) {
    return isValidTrialDays(planOverride) ? planOverride : "invalid";
  }

  if (setting.days !== undefined) {
    return isValidTrialDays(setting.days) ? setting.days : "invalid";
  }

  // Enabled with only byPlan for other plans — treat as no global; fall back.
  return "invalid";
}

/**
 * Resolves how many trial days to send on a new Checkout Session from env only.
 * `null` = trial off. Kept for unit tests and as the env fallback step.
 */
export function resolveTrialPeriodDays(
  raw: string | undefined = process.env.BILLING_TRIAL_PERIOD_DAYS,
): number | null {
  if (raw == null || raw.trim() === "") {
    return DEFAULT_TRIAL_PERIOD_DAYS;
  }

  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  if (OFF_TOKENS.has(lowered)) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    console.warn(
      `[billing] ${ENV_NAME}="${raw}" is not a valid trial length; using ${DEFAULT_TRIAL_PERIOD_DAYS}. Use 0 or "off" to disable.`,
    );
    return DEFAULT_TRIAL_PERIOD_DAYS;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_TRIAL_PERIOD_DAYS ||
    parsed > MAX_TRIAL_PERIOD_DAYS
  ) {
    console.warn(
      `[billing] ${ENV_NAME}=${parsed} outside ${MIN_TRIAL_PERIOD_DAYS}–${MAX_TRIAL_PERIOD_DAYS}; using ${DEFAULT_TRIAL_PERIOD_DAYS}. Use 0 or "off" to disable.`,
    );
    return DEFAULT_TRIAL_PERIOD_DAYS;
  }

  return parsed;
}

function environmentSourceLabel(): string {
  const raw = process.env.BILLING_TRIAL_PERIOD_DAYS;
  if (raw == null || raw.trim() === "") {
    return `default (${DEFAULT_TRIAL_PERIOD_DAYS} days; ${ENV_NAME} unset)`;
  }
  return ENV_NAME;
}

/**
 * Effective trial for a plan: platform console first, then environment.
 * Only affects NEW Checkout sessions.
 */
export function resolveEffectiveTrialPeriod(input?: {
  planCode?: string;
  /** Pre-loaded / parsed console value; null = no row; undefined = not provided */
  platformSetting?: BillingTrialSettingValue | null;
  envRaw?: string | undefined;
}): EffectiveTrialPeriod {
  const planCode = input?.planCode ?? BILLING_PLAN_STANDARD;

  if (input?.platformSetting) {
    const fromPlatform = resolveFromPlatformSetting(
      input.platformSetting,
      planCode,
    );
    if (fromPlatform !== "invalid") {
      return {
        days: fromPlatform,
        source: "platform",
        sourceLabel: "platform console",
      };
    }
    console.warn(
      `[billing] PlatformSetting ${PLATFORM_SETTING_BILLING_TRIAL} is invalid for plan ${planCode}; falling back to ${ENV_NAME}.`,
    );
  }

  const days = resolveTrialPeriodDays(input?.envRaw);
  return {
    days,
    source: "environment",
    sourceLabel: environmentSourceLabel(),
  };
}
