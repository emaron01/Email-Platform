/**
 * Effective trial period for NEW Checkout — loads PlatformSetting then env.
 */
import "server-only";

import {
  resolveEffectiveTrialPeriod,
  type EffectiveTrialPeriod,
} from "@/lib/billing/trial-period";
import { getBillingTrialPlatformSetting } from "@/lib/platform/settings";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

export async function loadEffectiveTrialPeriod(input?: {
  planCode?: string;
}): Promise<EffectiveTrialPeriod> {
  const platformSetting = await getBillingTrialPlatformSetting();
  return resolveEffectiveTrialPeriod({
    planCode: input?.planCode ?? BILLING_PLAN_STANDARD,
    platformSetting,
  });
}
