import "server-only";

import type { UsageResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectiveUsagePolicy } from "@/lib/usage/policy";
import { getOrganizationDayKey } from "@/lib/usage/timezone";

export class UsageQuotaError extends Error {
  readonly code = "USAGE_QUOTA_EXCEEDED";
  readonly resource: string;
  readonly used: number;
  readonly limit: number;

  constructor(message: string, resource: string, used: number, limit: number) {
    super(message);
    this.name = "UsageQuotaError";
    this.resource = resource;
    this.used = used;
    this.limit = limit;
  }
}

export type UsageResourceKind = "EMAIL_GENERATION" | "ACTIVE_RESEARCHED_COMPANY";

/**
 * Concurrent-safe reservation for period-based quotas (daily email generation).
 *
 * Uses a single INSERT ... ON CONFLICT DO UPDATE ... WHERE consumed < limit
 * so two simultaneous requests cannot both succeed past the limit.
 *
 * Active researched companies use a separate slot-count check (not this ledger).
 */
export async function assertUsageAllowed(input: {
  organizationId: string;
  userId: string;
  resource: UsageResourceKind;
  /** When checking ACTIVE_RESEARCHED_COMPANY, pass whether this company already has a fresh slot. */
  wouldConsumeNewActiveCompanySlot?: boolean;
  companyId?: string;
}): Promise<{ allowed: true; limit: number; used: number }> {
  const policy = await getEffectiveUsagePolicy({
    organizationId: input.organizationId,
    userId: input.userId,
  });

  if (input.resource === "ACTIVE_RESEARCHED_COMPANY") {
    const { countActiveResearchedCompanies } = await import(
      "@/lib/usage/active-companies"
    );
    const used = await countActiveResearchedCompanies(input.organizationId);
    const limit = policy.activeResearchedCompanyLimit;

    // Reusing an existing active company does not consume a new slot.
    if (input.wouldConsumeNewActiveCompanySlot === false) {
      return { allowed: true, limit, used };
    }

    if (used >= limit) {
      throw new UsageQuotaError(
        `Active researched company limit reached: ${used} of ${limit}.`,
        "ACTIVE_RESEARCHED_COMPANY",
        used,
        limit,
      );
    }

    // About to consume a new slot — warn at 80% of post-consume usage.
    const postConsumeUsed = used + 1;
    void maybeFireUsageAlert({
      organizationId: input.organizationId,
      resource: "ACTIVE_COMPANY",
      used: postConsumeUsed,
      limit,
    }).catch(() => undefined);

    return { allowed: true, limit, used };
  }

  // EMAIL_GENERATION — atomic ledger reservation (concurrency-safe).
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { timezone: true },
  });
  const periodKey = getOrganizationDayKey(org.timezone);
  const limit = policy.dailyEmailGenerationLimit;
  const resource: UsageResource = "EMAIL_GENERATION";

  if (limit <= 0) {
    throw new UsageQuotaError(
      `Daily email generation limit reached: 0 of ${limit}.`,
      "EMAIL_GENERATION",
      0,
      limit,
    );
  }

  const lockKey = `${input.organizationId}:${input.userId}:${periodKey}`;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx.usageQuotaLedger.findUnique({
      where: {
        organizationId_userId_resource_periodKey: {
          organizationId: input.organizationId,
          userId: input.userId,
          resource,
          periodKey,
        },
      },
    });

    const consumed = existing?.consumed ?? 0;
    if (consumed >= limit) {
      return { allowed: false as const, consumed, limit };
    }

    if (existing) {
      const updated = await tx.usageQuotaLedger.update({
        where: { id: existing.id },
        data: { consumed: { increment: 1 } },
      });
      return { allowed: true as const, consumed: updated.consumed, limit };
    }

    await tx.usageQuotaLedger.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        resource,
        periodKey,
        consumed: 1,
      },
    });
    return { allowed: true as const, consumed: 1, limit };
  });

  if (!result.allowed) {
    throw new UsageQuotaError(
      `Daily email generation limit reached: ${result.consumed} of ${result.limit}.`,
      "EMAIL_GENERATION",
      result.consumed,
      result.limit,
    );
  }

  void maybeFireUsageAlert({
    organizationId: input.organizationId,
    resource: "EMAIL_GENERATION",
    used: result.consumed,
    limit: result.limit,
    periodKey,
  }).catch(() => undefined);

  return {
    allowed: true,
    limit: result.limit,
    used: result.consumed,
  };
}

async function maybeFireUsageAlert(input: {
  organizationId: string;
  resource: "ACTIVE_COMPANY" | "EMAIL_GENERATION";
  used: number;
  limit: number;
  periodKey?: string;
}): Promise<void> {
  const { maybeSendUsageLimitWarning, periodKeyForActiveCompany } =
    await import("@/lib/usage/alerts");
  const periodKey =
    input.periodKey ??
    (input.resource === "EMAIL_GENERATION"
      ? undefined
      : periodKeyForActiveCompany());
  if (!periodKey && input.resource === "EMAIL_GENERATION") return;
  await maybeSendUsageLimitWarning({
    organizationId: input.organizationId,
    resource: input.resource,
    used: input.used,
    limit: input.limit,
    periodKey: periodKey!,
  });
}

export async function getDailyEmailUsage(input: {
  organizationId: string;
  userId: string;
}): Promise<{ used: number; limit: number; periodKey: string }> {
  const policy = await getEffectiveUsagePolicy(input);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { timezone: true },
  });
  const periodKey = getOrganizationDayKey(org.timezone);
  const row = await prisma.usageQuotaLedger.findUnique({
    where: {
      organizationId_userId_resource_periodKey: {
        organizationId: input.organizationId,
        userId: input.userId,
        resource: "EMAIL_GENERATION",
        periodKey,
      },
    },
  });
  return {
    used: row?.consumed ?? 0,
    limit: policy.dailyEmailGenerationLimit,
    periodKey,
  };
}

export type DailyEmailSendUsage = {
  used: number;
  warningLimit: number;
  limit: number;
  periodKey: string;
  warning: boolean;
};

/**
 * Counts a confirmed send toward the daily advisory ledger.
 * Never blocks — volume is the rep's domain-reputation risk, not our cost.
 */
export async function reserveDailyEmailSend(input: {
  organizationId: string;
  userId: string;
}): Promise<DailyEmailSendUsage> {
  const policy = await getEffectiveUsagePolicy(input);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { timezone: true },
  });
  const periodKey = getOrganizationDayKey(org.timezone);
  const resource: UsageResource = "EMAIL_SEND";
  const warningLimit = policy.dailyEmailSendWarningLimit;
  const lockKey = `${input.organizationId}:${input.userId}:${resource}:${periodKey}`;
  const used = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const existing = await tx.usageQuotaLedger.findUnique({
      where: {
        organizationId_userId_resource_periodKey: {
          organizationId: input.organizationId,
          userId: input.userId,
          resource,
          periodKey,
        },
      },
    });
    if (existing) {
      const updated = await tx.usageQuotaLedger.update({
        where: { id: existing.id },
        data: { consumed: { increment: 1 } },
      });
      return updated.consumed;
    }
    const created = await tx.usageQuotaLedger.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        resource,
        periodKey,
        consumed: 1,
      },
    });
    return created.consumed;
  });
  return {
    used,
    warningLimit,
    // Retained for callers; advisory uses warningLimit only (no hard block).
    limit: warningLimit,
    periodKey,
    warning: used >= warningLimit,
  };
}

export async function releaseDailyEmailSendReservation(input: {
  organizationId: string;
  userId: string;
  periodKey: string;
}): Promise<void> {
  const lockKey = `${input.organizationId}:${input.userId}:EMAIL_SEND:${input.periodKey}`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const row = await tx.usageQuotaLedger.findUnique({
      where: {
        organizationId_userId_resource_periodKey: {
          organizationId: input.organizationId,
          userId: input.userId,
          resource: "EMAIL_SEND",
          periodKey: input.periodKey,
        },
      },
    });
    if (!row || row.consumed <= 0) return;
    await tx.usageQuotaLedger.update({
      where: { id: row.id },
      data: { consumed: { decrement: 1 } },
    });
  });
}

export async function getDailyEmailSendUsage(input: {
  organizationId: string;
  userId: string;
}): Promise<DailyEmailSendUsage> {
  const policy = await getEffectiveUsagePolicy(input);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { timezone: true },
  });
  const periodKey = getOrganizationDayKey(org.timezone);
  const row = await prisma.usageQuotaLedger.findUnique({
    where: {
      organizationId_userId_resource_periodKey: {
        organizationId: input.organizationId,
        userId: input.userId,
        resource: "EMAIL_SEND",
        periodKey,
      },
    },
  });
  const used = row?.consumed ?? 0;
  const warningLimit = policy.dailyEmailSendWarningLimit;
  return {
    used,
    warningLimit,
    limit: warningLimit,
    periodKey,
    warning: used >= warningLimit,
  };
}
