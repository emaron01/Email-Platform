import "server-only";

import type { UsageAlertResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { getOrganizationDayKey } from "@/lib/usage/timezone";

export const USAGE_LIMIT_ALERT_THRESHOLD_PERCENT = 80;

function resourceLabel(resource: UsageAlertResource): string {
  switch (resource) {
    case "ACTIVE_COMPANY":
      return "active researched companies";
    case "EMAIL_GENERATION":
      return "daily AI email generations";
    default:
      return "usage";
  }
}

/**
 * After a successful quota consume, send USAGE_LIMIT_WARNING once per
 * org+resource+period+threshold when used/limit >= 80%.
 * Never includes payment/card/address data — VARIABLES only.
 */
export async function maybeSendUsageLimitWarning(input: {
  organizationId: string;
  resource: UsageAlertResource;
  used: number;
  limit: number;
  periodKey: string;
}): Promise<{ sent: boolean }> {
  const { used, limit, periodKey, organizationId, resource } = input;
  if (limit <= 0 || used <= 0) return { sent: false };
  const percentUsed = Math.floor((used / limit) * 100);
  if (percentUsed < USAGE_LIMIT_ALERT_THRESHOLD_PERCENT) {
    return { sent: false };
  }

  try {
    await prisma.usageAlertLedger.create({
      data: {
        organizationId,
        resource,
        periodKey,
        thresholdPercent: USAGE_LIMIT_ALERT_THRESHOLD_PERCENT,
      },
    });
  } catch (error) {
    // Unique constraint = already alerted this period.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { sent: false };
    }
    throw error;
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      billingProfile: { select: { billingEmail: true } },
      memberships: {
        where: { isBillingContact: true },
        take: 1,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!org) return { sent: false };

  const billingMember = org.memberships[0]?.user;
  const to =
    org.billingProfile?.billingEmail?.trim() ||
    billingMember?.email?.trim() ||
    null;
  if (!to) return { sent: false };

  const appUrl =
    process.env.APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000";

  const firstName =
    billingMember?.firstName?.trim() ||
    billingMember?.name?.trim()?.split(/\s+/)[0] ||
    "there";

  try {
    const { ensureTransactionalTemplatesSeeded } = await import(
      "@/lib/transactional-email/seed"
    );
    await ensureTransactionalTemplatesSeeded();
    const { sendTransactionalEmail } = await import(
      "@/lib/transactional-email/send"
    );
    await sendTransactionalEmail({
      templateKey: "USAGE_LIMIT_WARNING",
      to,
      organizationId,
      userId: billingMember?.id ?? null,
      idempotencyKey: `usage-limit:${organizationId}:${resource}:${periodKey}:${USAGE_LIMIT_ALERT_THRESHOLD_PERCENT}`,
      variables: {
        firstName,
        workspaceName: org.name,
        resourceLabel: resourceLabel(resource),
        used: String(used),
        limit: String(limit),
        percentUsed: String(percentUsed),
        settingsUrl: `${appUrl}/settings/usage`,
      },
    });

    await recordAdminAuditEvent({
      action: "USAGE_LIMIT_ALERT_SENT",
      organizationId,
      metadata: {
        resource,
        periodKey,
        thresholdPercent: USAGE_LIMIT_ALERT_THRESHOLD_PERCENT,
        used,
        limit,
        percentUsed,
      },
    });

    return { sent: true };
  } catch {
    // Alert email failure must not block the original usage path.
    return { sent: false };
  }
}

export async function periodKeyForEmailGeneration(
  organizationId: string,
): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return getOrganizationDayKey(org.timezone);
}

/** Active-company slots are entitlement-scoped; one alert per calendar month. */
export function periodKeyForActiveCompany(at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
