/**
 * Effective Stripe Price/Product IDs — loads PlatformSetting then env.
 */
import "server-only";

import {
  flattenEffectiveBillingPrices,
  resolveEffectiveBillingPrices,
  type BillingPricesSettingValue,
  type EffectiveBillingPrices,
} from "@/lib/billing/billing-prices";
import { getBillingPricesPlatformSetting } from "@/lib/platform/settings";

export async function loadEffectiveBillingPrices(): Promise<EffectiveBillingPrices> {
  const platformSetting = await getBillingPricesPlatformSetting();
  return resolveEffectiveBillingPrices({ platformSetting });
}

export async function loadFlattenedBillingPrices(): Promise<{
  standardMonthlyPriceId: string | null;
  standardProductId: string | null;
  companyCreditsPriceId: string | null;
  platformSetting: BillingPricesSettingValue | null;
  effective: EffectiveBillingPrices;
}> {
  const platformSetting = await getBillingPricesPlatformSetting();
  const effective = resolveEffectiveBillingPrices({ platformSetting });
  return {
    ...flattenEffectiveBillingPrices(effective),
    platformSetting,
    effective,
  };
}
