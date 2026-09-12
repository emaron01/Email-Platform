/**
 * Load effective billing.catalog — PlatformSetting or code seed fallback.
 */
import "server-only";

import {
  defaultBillingCatalogSetting,
  parseBillingCatalogSetting,
  PLATFORM_SETTING_BILLING_CATALOG,
  type BillingCatalogSettingValue,
  type CatalogPlanEntry,
  findCatalogPlan,
} from "@/lib/billing/billing-catalog";
import { BILLING_PLAN_STANDARD } from "@/lib/billing/plans";
import {
  getPlatformSettingValue,
  hasPlatformSetting,
  upsertBillingCatalogSetting,
} from "@/lib/platform/settings";

export type EffectiveBillingCatalog = {
  catalog: BillingCatalogSettingValue;
  source: "platform" | "code";
  sourceLabel: string;
};

export async function loadEffectiveBillingCatalog(): Promise<EffectiveBillingCatalog> {
  const raw = await getPlatformSettingValue(PLATFORM_SETTING_BILLING_CATALOG);
  const parsed = parseBillingCatalogSetting(raw);
  if (parsed) {
    return {
      catalog: parsed,
      source: "platform",
      sourceLabel: "Platform console",
    };
  }
  return {
    catalog: defaultBillingCatalogSetting(),
    source: "code",
    sourceLabel: "Code defaults (plans.ts)",
  };
}

/** Write code defaults into PlatformSetting once so the console has an editable row. */
export async function ensureBillingCatalogSeeded(
  actorUserId: string,
): Promise<boolean> {
  if (await hasPlatformSetting(PLATFORM_SETTING_BILLING_CATALOG)) {
    return false;
  }
  await upsertBillingCatalogSetting({
    value: defaultBillingCatalogSetting(),
    actorUserId,
  });
  return true;
}

export async function loadCatalogPlan(
  planCode: string = BILLING_PLAN_STANDARD,
): Promise<{
  plan: CatalogPlanEntry;
  catalog: BillingCatalogSettingValue;
  source: "platform" | "code";
}> {
  const effective = await loadEffectiveBillingCatalog();
  const plan =
    findCatalogPlan(effective.catalog, planCode) ??
    findCatalogPlan(defaultBillingCatalogSetting(), planCode)!;
  return {
    plan,
    catalog: effective.catalog,
    source: effective.source,
  };
}
