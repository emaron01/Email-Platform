/**
 * Stripe referral reward coupons — fixed ids for test/live parity.
 * Create once via: npm run billing:create-referral-coupons
 */
export const REFERRAL_REWARD_PERCENTS = [10, 20, 30, 40, 50] as const;
export type ReferralRewardPercent = (typeof REFERRAL_REWARD_PERCENTS)[number];

export const REFERRAL_REWARD_COUPON_IDS = {
  10: "referral_reward_10",
  20: "referral_reward_20",
  30: "referral_reward_30",
  40: "referral_reward_40",
  50: "referral_reward_50",
} as const satisfies Record<ReferralRewardPercent, string>;

/** Env override preferred; falls back to fixed Stripe coupon id. */
export function referralRewardCouponId(percent: ReferralRewardPercent): string {
  const envName = `STRIPE_COUPON_REFERRAL_${percent}` as const;
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  return REFERRAL_REWARD_COUPON_IDS[percent];
}

/** Shared 10% coupon all referee promotion codes point at. */
export function referralRefereeCouponId(): string {
  return referralRewardCouponId(10);
}

export function rewardPercentForCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(50, count * 10);
}

export function asReferralRewardPercent(
  percent: number,
): ReferralRewardPercent | null {
  if (
    percent === 10 ||
    percent === 20 ||
    percent === 30 ||
    percent === 40 ||
    percent === 50
  ) {
    return percent;
  }
  return null;
}
