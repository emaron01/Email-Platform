/**
 * Published EULA lookup, acceptance checks, and recording.
 */
import "server-only";

import type { EulaVersion } from "@prisma/client";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { prisma } from "@/lib/prisma";
import {
  fillEulaSeedDate,
  INITIAL_EULA_CONTENT,
} from "@/lib/legal/eula-seed";

export async function ensureEulaSeeded(
  createdByUserId?: string | null,
): Promise<EulaVersion> {
  const existing = await prisma.eulaVersion.findFirst({
    orderBy: { versionNumber: "asc" },
  });
  if (existing) return existing;

  const now = new Date();
  return prisma.eulaVersion.create({
    data: {
      versionNumber: 1,
      content: fillEulaSeedDate(INITIAL_EULA_CONTENT, now),
      publishedAt: now,
      createdByUserId: createdByUserId ?? null,
    },
  });
}

export async function getPublishedEulaVersion(): Promise<EulaVersion | null> {
  await ensureEulaSeeded();
  return prisma.eulaVersion.findFirst({
    where: { publishedAt: { not: null } },
    orderBy: { versionNumber: "desc" },
  });
}

export async function userHasAcceptedEulaVersion(
  userId: string,
  eulaVersionId: string,
): Promise<boolean> {
  const row = await prisma.userEulaAcceptance.findUnique({
    where: {
      userId_eulaVersionId: { userId, eulaVersionId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function userNeedsEulaAcceptance(
  userId: string,
): Promise<{ needs: false } | { needs: true; version: EulaVersion }> {
  const version = await getPublishedEulaVersion();
  if (!version) return { needs: false };
  const accepted = await userHasAcceptedEulaVersion(userId, version.id);
  if (accepted) return { needs: false };
  return { needs: true, version };
}

export async function userHasPriorEulaAcceptance(
  userId: string,
): Promise<boolean> {
  const count = await prisma.userEulaAcceptance.count({
    where: { userId },
  });
  return count > 0;
}

export async function recordEulaAcceptance(input: {
  userId: string;
  eulaVersionId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await prisma.userEulaAcceptance.upsert({
    where: {
      userId_eulaVersionId: {
        userId: input.userId,
        eulaVersionId: input.eulaVersionId,
      },
    },
    update: {
      acceptedAt: new Date(),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
    create: {
      userId: input.userId,
      eulaVersionId: input.eulaVersionId,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  await recordAdminAuditEvent({
    action: "EULA_ACCEPTED",
    actorUserId: input.userId,
    targetUserId: input.userId,
    metadata: { eulaVersionId: input.eulaVersionId },
  });
}

/** Client IP for acceptance audit (best-effort from proxy headers). */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 128) : null;
}

export function clientUserAgentFromHeaders(headers: Headers): string | null {
  const ua = headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 512) : null;
}
