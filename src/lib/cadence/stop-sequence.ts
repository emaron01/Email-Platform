import "server-only";

import type { SequenceStopReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recomputeCampaignContactCadence } from "@/lib/cadence/recompute";

export async function stopSequenceForContact(input: {
  campaignContactId: string;
  organizationId: string;
  reason: SequenceStopReason;
  actorUserId?: string | null;
}): Promise<void> {
  const row = await prisma.campaignContact.findFirst({
    where: {
      id: input.campaignContactId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });
  if (!row) {
    throw new TenantError(
      "Campaign contact does not belong to the active organization.",
    );
  }
  const now = new Date();
  await prisma.campaignContact.update({
    where: { id: row.id },
    data: {
      sequenceStoppedAt: now,
      sequenceStoppedReason: input.reason,
      sequenceStoppedByUserId: input.actorUserId ?? null,
      nextDueAt: null,
    },
  });
  await recomputeCampaignContactCadence(row.id);
}

export async function restoreSequenceForContact(input: {
  campaignContactId: string;
  organizationId: string;
}): Promise<void> {
  const row = await prisma.campaignContact.findFirst({
    where: {
      id: input.campaignContactId,
      organizationId: input.organizationId,
    },
    select: { id: true, sequenceStoppedReason: true },
  });
  if (!row) {
    throw new TenantError(
      "Campaign contact does not belong to the active organization.",
    );
  }
  if (
    row.sequenceStoppedReason !== "MANUAL_STOP" &&
    row.sequenceStoppedReason !== "MAX_SEQUENCE"
  ) {
    throw new TenantError(
      "Only manually stopped or max-sequence contacts can be restored.",
    );
  }
  await prisma.campaignContact.update({
    where: { id: row.id },
    data: {
      sequenceStoppedAt: null,
      sequenceStoppedReason: null,
      sequenceStoppedByUserId: null,
    },
  });
  await recomputeCampaignContactCadence(row.id);
}
