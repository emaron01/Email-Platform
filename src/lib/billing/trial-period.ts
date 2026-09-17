/**
 * Trial length for NEW sellable Checkout sessions (Standard / Team).
 *
 * Resolution order for a plan:
 *   1. PlatformSetting "billing.trial" plans[plan] (per-plan on/off + days)
 *   2. Legacy console: byPlan[plan] → global days → off
 *   3. BILLING_TRIAL_PERIOD_DAYS env (fallback when no console row)
 *   4. Default 7 / off tokens
 *
 * Does not change subscriptions already created in Stripe.
 */

import {
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";

export const DEFAULT_TRIAL_PERIOD_DAYS = 7;
/** Inclusive bounds for an active trial — thousand-day misconfigs fall back. */
export const MIN_TRIAL_PERIOD_DAYS = 1;
export const MAX_TRIAL_PERIOD_DAYS = 90;

export const PLATFORM_SETTING_BILLING_TRIAL = "billing.trial";

const ENV_NAME = "BILLING_TRIAL_PERIOD_DAYS";

const OFF_TOKENS = new Set(["0", "off", "false", "none", "disabled"]);

export type BillingTrialPlanConfig = {
  enabled: boolean;
  /** Required when enabled. */
  days?: number;
};

/**
 * Console payload for billing.trial.
 * Prefer `plans` for independent Standard / Team toggles.
 * Legacy `enabled` + `days` + `byPlan` still parse for older rows.
 */
export type BillingTrialSettingValue = {
  enabled: boolean;
  /** Global days when enabled (legacy); also mirrored from Standard on save. */
  days?: number;
  /** Optional per-plan day overrides (legacy), e.g. { PREMIUM: 30 }. */
  byPlan?: Record<string, number>;
  /** Per-plan on/off + days (Standard / Team). Takes precedence when set. */
  plans?: Partial<Record<string, BillingTrialPlanConfig>>;
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

function parsePlanConfig(raw: unknown): BillingTrialPlanConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.enabled !== "boolean") return null;
  if (!obj.enabled) {
    return { enabled: false };
  }
  if (!isValidTrialDays(obj.days)) return null;
  return { enabled: true, days: obj.days };
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

  if (obj.plans !== undefined) {
    if (
      !obj.plans ||
      typeof obj.plans !== "object" ||
      Array.isArray(obj.plans)
    ) {
      return null;
    }
    const plans: Record<string, BillingTrialPlanConfig> = {};
    for (const [plan, cfg] of Object.entries(
      obj.plans as Record<string, unknown>,
    )) {
      if (!plan.trim()) return null;
      const parsed = parsePlanConfig(cfg);
      if (!parsed) return null;
      plans[plan] = parsed;
    }
    result.plans = plans;
  }

  const hasPlans = Boolean(result.plans && Object.keys(result.plans).length > 0);
  if (
    result.enabled &&
    result.days == null &&
    !result.byPlan &&
    !hasPlans
  ) {
    return null;
  }

  return result;
}

function planConfigFromForm(input: {
  enabled: boolean;
  days: number;
}): BillingTrialPlanConfig {
  if (!input.enabled) return { enabled: false };
  if (!isValidTrialDays(input.days)) {
    throw new Error(
      `Trial days must be an integer from ${MIN_TRIAL_PERIOD_DAYS} to ${MAX_TRIAL_PERIOD_DAYS}.`,
    );
  }
  return { enabled: true, days: input.days };
}

/**
 * Build console payload from independent Standard / Team controls.
 * Also writes legacy `enabled` / `days` so older readers stay coherent.
 */
export function buildBillingTrialSetting(input: {
  standard: { enabled: boolean; days: number };
  team: { enabled: boolean; days: number };
  /** Preserve legacy byPlan keys other than STANDARD/TEAM when re-saving. */
  existingByPlan?: Record<string, number>;
}): BillingTrialSettingValue {
  const standard = planConfigFromForm(input.standard);
  const team = planConfigFromForm(input.team);
  const anyEnabled = standard.enabled || team.enabled;

  const value: BillingTrialSettingValue = {
    enabled: anyEnabled,
    plans: {
      [BILLING_PLAN_STANDARD]: standard,
      [BILLING_PLAN_TEAM]: team,
    },
  };

  if (standard.enabled && standard.days != null) {
    value.days = standard.days;
  } else if (team.enabled && team.days != null) {
    value.days = team.days;
  }

  if (input.existingByPlan && Object.keys(input.existingByPlan).length > 0) {
    const preserved: Record<string, number> = {};
    for (const [plan, days] of Object.entries(input.existingByPlan)) {
      if (plan === BILLING_PLAN_STANDARD || plan === BILLING_PLAN_TEAM) continue;
      preserved[plan] = days;
    }
    if (Object.keys(preserved).length > 0) {
      value.byPlan = preserved;
    }
  }

  return value;
}

/**
 * Form defaults for Standard / Team from console row + effective resolution.
 */
export function trialPlanFormState(input: {
  platformSetting: BillingTrialSettingValue | null;
  standardEffectiveDays: number | null;
  teamEffectiveDays: number | null;
}): {
  standard: { enabled: boolean; days: number };
  team: { enabled: boolean; days: number };
} {
  const setting = input.platformSetting;
  const fallbackDays = (days: number | null) =>
    days != null && days > 0 ? days : DEFAULT_TRIAL_PERIOD_DAYS;

  function fromPlans(
    planCode: string,
    effectiveDays: number | null,
  ): { enabled: boolean; days: number } {
    const cfg = setting?.plans?.[planCode];
    if (cfg) {
      return {
        enabled: cfg.enabled,
        days: cfg.enabled
          ? (cfg.days ?? fallbackDays(effectiveDays))
          : fallbackDays(effectiveDays),
      };
    }
    if (!setting) {
      return {
        enabled: effectiveDays != null,
        days: fallbackDays(effectiveDays),
      };
    }
    // Legacy row without plans[plan]: mirror global enabled + days / byPlan.
    if (!setting.enabled) {
      return { enabled: false, days: fallbackDays(effectiveDays) };
    }
    const override = setting.byPlan?.[planCode];
    if (override != null) {
      return { enabled: true, days: override };
    }
    return {
      enabled: true,
      days: setting.days ?? fallbackDays(effectiveDays),
    };
  }

  return {
    standard: fromPlans(BILLING_PLAN_STANDARD, input.standardEffectiveDays),
    team: fromPlans(BILLING_PLAN_TEAM, input.teamEffectiveDays),
  };
}

function resolveFromPlatformSetting(
  setting: BillingTrialSettingValue,
  planCode: string,
): number | null | "invalid" {
  const planCfg = setting.plans?.[planCode];
  if (planCfg) {
    if (!planCfg.enabled) return null;
    return isValidTrialDays(planCfg.days) ? planCfg.days : "invalid";
  }

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
