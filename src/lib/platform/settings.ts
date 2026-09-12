/**
 * PlatformSetting read/write — SUPER_ADMIN console configuration.
 */
import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import {
  PLATFORM_SETTING_BILLING_PRICES,
  parseBillingPricesSetting,
  type BillingPricesSettingValue,
} from "@/lib/billing/billing-prices";
import {
  PLATFORM_SETTING_BILLING_CATALOG,
  parseBillingCatalogSetting,
  type BillingCatalogSettingValue,
} from "@/lib/billing/billing-catalog";
import {
  PLATFORM_SETTING_BILLING_TRIAL,
  parseBillingTrialSetting,
  type BillingTrialSettingValue,
} from "@/lib/billing/trial-period";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";

export async function getPlatformSettingValue(
  key: string,
): Promise<unknown | null> {
  const row = await prisma.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return row?.value ?? null;
}

export async function hasPlatformSetting(key: string): Promise<boolean> {
  const row = await prisma.platformSetting.findUnique({
    where: { key },
    select: { id: true },
  });
  return Boolean(row);
}

export async function getBillingTrialPlatformSetting(): Promise<BillingTrialSettingValue | null> {
  const raw = await getPlatformSettingValue(PLATFORM_SETTING_BILLING_TRIAL);
  if (raw == null) return null;
  return parseBillingTrialSetting(raw);
}

export async function getBillingPricesPlatformSetting(): Promise<BillingPricesSettingValue | null> {
  const raw = await getPlatformSettingValue(PLATFORM_SETTING_BILLING_PRICES);
  if (raw == null) return null;
  return parseBillingPricesSetting(raw);
}

export async function getBillingCatalogPlatformSetting(): Promise<BillingCatalogSettingValue | null> {
  const raw = await getPlatformSettingValue(PLATFORM_SETTING_BILLING_CATALOG);
  if (raw == null) return null;
  return parseBillingCatalogSetting(raw);
}

export async function upsertPlatformSetting(input: {
  key: string;
  value: Prisma.InputJsonValue;
  actorUserId: string;
}): Promise<void> {
  const key = input.key.trim();
  if (!key) throw new TenantError("Setting key is required.");

  await prisma.platformSetting.upsert({
    where: { key },
    create: {
      key,
      value: input.value,
      updatedByUserId: input.actorUserId,
    },
    update: {
      value: input.value,
      updatedByUserId: input.actorUserId,
    },
  });

  await recordAdminAuditEvent({
    action: "PLATFORM_SETTING_CHANGED",
    actorUserId: input.actorUserId,
    metadata: { key },
  });
}

export async function deletePlatformSetting(input: {
  key: string;
  actorUserId: string;
}): Promise<void> {
  const key = input.key.trim();
  const existing = await prisma.platformSetting.findUnique({
    where: { key },
    select: { id: true },
  });
  if (!existing) return;

  await prisma.platformSetting.delete({ where: { key } });
  await recordAdminAuditEvent({
    action: "PLATFORM_SETTING_CHANGED",
    actorUserId: input.actorUserId,
    metadata: { key, cleared: true },
  });
}

export async function upsertBillingTrialSetting(input: {
  value: BillingTrialSettingValue;
  actorUserId: string;
}): Promise<void> {
  const parsed = parseBillingTrialSetting(input.value);
  if (!parsed) {
    throw new TenantError("Invalid billing trial setting payload.");
  }
  await upsertPlatformSetting({
    key: PLATFORM_SETTING_BILLING_TRIAL,
    value: parsed as Prisma.InputJsonValue,
    actorUserId: input.actorUserId,
  });
}

export async function upsertBillingPricesSetting(input: {
  value: BillingPricesSettingValue;
  actorUserId: string;
}): Promise<void> {
  const parsed = parseBillingPricesSetting(input.value);
  if (!parsed) {
    throw new TenantError("Invalid billing prices setting payload.");
  }
  await upsertPlatformSetting({
    key: PLATFORM_SETTING_BILLING_PRICES,
    value: parsed as Prisma.InputJsonValue,
    actorUserId: input.actorUserId,
  });
}

export async function upsertBillingCatalogSetting(input: {
  value: BillingCatalogSettingValue;
  actorUserId: string;
}): Promise<void> {
  const parsed = parseBillingCatalogSetting(input.value);
  if (!parsed) {
    throw new TenantError("Invalid billing catalog setting payload.");
  }
  await upsertPlatformSetting({
    key: PLATFORM_SETTING_BILLING_CATALOG,
    value: parsed as Prisma.InputJsonValue,
    actorUserId: input.actorUserId,
  });
}
