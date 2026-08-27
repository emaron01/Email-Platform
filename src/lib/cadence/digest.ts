import "server-only";

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/transactional-email/send-service";
import { ensureTransactionalTemplatesSeeded } from "@/lib/transactional-email/seed";
import { countDueContactsForUser } from "@/lib/cadence/dashboard";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function parseLocalTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

/** Period key (YYYY-MM-DD) for a Date in an IANA timezone. */
export function periodKeyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function weekdayInTimezone(date: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekday,
  );
  return index >= 0 ? index : date.getDay();
}

function localTimeParts(date: Date, timezone: string): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  return { hour, minute: minute % 60 };
}

export function resolveUserTimezone(input: {
  userTimezone: string | null;
  organizationTimezone: string;
}): string {
  return input.userTimezone?.trim() || input.organizationTimezone || "UTC";
}

export function shouldSendDigestNow(input: {
  now: Date;
  timezone: string;
  digestSendTimeLocal: string;
}): boolean {
  const weekday = weekdayInTimezone(input.now, input.timezone);
  if (weekday === 0 || weekday === 6) return false;

  const target = parseLocalTime(input.digestSendTimeLocal);
  if (!target) return false;

  const local = localTimeParts(input.now, input.timezone);
  if (local.hour !== target.hour) return false;
  return local.minute >= target.minute && local.minute < target.minute + 15;
}

export type DigestRunResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
};

/**
 * Send weekday-morning cadence digests for eligible users.
 * Idempotent per user per local calendar day. Never sends when dueCount=0.
 */
export async function runCadenceDigestJob(
  now: Date = new Date(),
): Promise<DigestRunResult> {
  await ensureTransactionalTemplatesSeeded();

  const users = await prisma.user.findMany({
    where: {
      digestEnabled: true,
      activeOrganizationId: { not: null },
      memberships: { some: {} },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      name: true,
      timezone: true,
      digestSendTimeLocal: true,
      activeOrganizationId: true,
      activeOrganization: { select: { id: true, name: true, timezone: true } },
    },
  });

  const result: DigestRunResult = {
    scanned: users.length,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  for (const user of users) {
    const organization = user.activeOrganization;
    if (!organization) {
      result.skipped += 1;
      continue;
    }

    const timezone = resolveUserTimezone({
      userTimezone: user.timezone,
      organizationTimezone: organization.timezone,
    });

    if (!shouldSendDigestNow({ now, timezone, digestSendTimeLocal: user.digestSendTimeLocal })) {
      result.skipped += 1;
      continue;
    }

    const periodKey = periodKeyInTimezone(now, timezone);
    const existing = await prisma.dailyDigestSend.findUnique({
      where: { userId_periodKey: { userId: user.id, periodKey } },
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }

    const dueCount = await countDueContactsForUser({
      organizationId: organization.id,
    });
    if (dueCount === 0) {
      result.skipped += 1;
      continue;
    }

    const weekdayLabel = WEEKDAY_NAMES[weekdayInTimezone(now, timezone)] ?? "Today";
    const firstName =
      user.firstName?.trim() ||
      user.name?.split(/\s+/)[0]?.trim() ||
      "there";

    try {
      await sendTransactionalEmail({
        templateKey: "CADENCE_DAILY_DIGEST",
        to: user.email,
        userId: user.id,
        organizationId: organization.id,
        idempotencyKey: `cadence-digest:${user.id}:${periodKey}`,
        variables: {
          firstName,
          workspaceName: organization.name,
          dueCount: String(dueCount),
          dueCountPlural: dueCount === 1 ? "" : "s",
          weekdayLabel,
          dashboardUrl: `${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/`,
        },
      });
      await prisma.dailyDigestSend.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          periodKey,
          dueCount,
        },
      });
      result.sent += 1;
    } catch (error) {
      console.error("Cadence digest send failed.", { userId: user.id, error });
      result.errors += 1;
    }
  }

  return result;
}
