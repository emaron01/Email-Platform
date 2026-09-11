/**
 * Trial length for new STANDARD Checkout sessions.
 * Read from BILLING_TRIAL_PERIOD_DAYS; invalid/missing → DEFAULT (7) + warn.
 * Explicit off: 0 | off | false | none | disabled → no trial on new Checkout.
 * Does not change subscriptions already created in Stripe.
 */

export const DEFAULT_TRIAL_PERIOD_DAYS = 7;
/** Inclusive bounds for an active trial — thousand-day misconfigs fall back. */
export const MIN_TRIAL_PERIOD_DAYS = 1;
export const MAX_TRIAL_PERIOD_DAYS = 90;

const ENV_NAME = "BILLING_TRIAL_PERIOD_DAYS";

const OFF_TOKENS = new Set(["0", "off", "false", "none", "disabled"]);

/**
 * Resolves how many trial days to send on a new Checkout Session.
 * `null` = trial off (omit trial_period_days). Only affects NEW subscriptions.
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
