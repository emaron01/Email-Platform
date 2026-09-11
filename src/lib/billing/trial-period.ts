/**
 * Trial length for new STANDARD Checkout sessions.
 * Read from BILLING_TRIAL_PERIOD_DAYS; invalid/missing → DEFAULT (7) + warn.
 * Does not change subscriptions already created in Stripe.
 */

export const DEFAULT_TRIAL_PERIOD_DAYS = 7;
/** Inclusive bounds — rejects 0-day and thousand-day misconfigs. */
export const MIN_TRIAL_PERIOD_DAYS = 1;
export const MAX_TRIAL_PERIOD_DAYS = 90;

const ENV_NAME = "BILLING_TRIAL_PERIOD_DAYS";

/**
 * Resolves how many trial days to send on a new Checkout Session.
 * Only affects NEW subscriptions (Stripe trial_period_days at create time).
 */
export function resolveTrialPeriodDays(
  raw: string | undefined = process.env.BILLING_TRIAL_PERIOD_DAYS,
): number {
  if (raw == null || raw.trim() === "") {
    return DEFAULT_TRIAL_PERIOD_DAYS;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(
      `[billing] ${ENV_NAME}="${raw}" is not a non-negative integer; using ${DEFAULT_TRIAL_PERIOD_DAYS}.`,
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
      `[billing] ${ENV_NAME}=${parsed} outside ${MIN_TRIAL_PERIOD_DAYS}–${MAX_TRIAL_PERIOD_DAYS}; using ${DEFAULT_TRIAL_PERIOD_DAYS}.`,
    );
    return DEFAULT_TRIAL_PERIOD_DAYS;
  }

  return parsed;
}
