import "server-only";

import type { Prisma, SequenceStopReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeNextDueAt,
  isAtMaxSequence,
} from "@/lib/cadence/engine";
import { ensureOrganizationCadencePolicy } from "@/lib/cadence/defaults";
import { findActiveSuppression } from "@/lib/suppression/service";

type RecomputeResult = {
  campaignContactId: string;
  nextDueAt: Date | null;
  sequenceStoppedAt: Date | null;
  sequenceStoppedReason: SequenceStopReason | null;
};

async function loadCadenceState(campaignContactId: string) {
  return prisma.campaignContact.findUnique({
    where: { id: campaignContactId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      sequenceStoppedAt: true,
      sequenceStoppedReason: true,
      sequenceStoppedByUserId: true,
      campaign: { select: { archivedAt: true } },
      contact: { select: { email: true } },
      emailDrafts: {
        where: { status: "SENT", sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      },
    },
  });
}

function resolveAutoStopReason(input: {
  status: string;
  campaignArchived: boolean;
  suppressed: boolean;
  sentCount: number;
  maxSequenceEmails: number | null;
  existingReason: SequenceStopReason | null;
  existingStoppedAt: Date | null;
}): {
  reason: SequenceStopReason | null;
  stoppedAt: Date | null;
} {
  if (
    input.existingReason === "THEY_REPLIED" ||
    input.existingReason === "MANUAL_STOP"
  ) {
    return {
      reason: input.existingReason,
      stoppedAt: input.existingStoppedAt,
    };
  }
  if (input.status === "EXCLUDED") {
    return { reason: "EXCLUDED", stoppedAt: input.existingStoppedAt ?? new Date() };
  }
  if (input.suppressed) {
    return { reason: "SUPPRESSED", stoppedAt: input.existingStoppedAt ?? new Date() };
  }
  if (input.campaignArchived) {
    return {
      reason: "CAMPAIGN_ARCHIVED",
      stoppedAt: input.existingStoppedAt ?? new Date(),
    };
  }
  if (isAtMaxSequence(input.sentCount, input.maxSequenceEmails)) {
    return {
      reason: "MAX_SEQUENCE",
      stoppedAt: input.existingStoppedAt ?? new Date(),
    };
  }
  return { reason: null, stoppedAt: null };
}

async function recomputeOne(
  campaignContactId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<RecomputeResult | null> {
  const row = await loadCadenceState(campaignContactId);
  if (!row) return null;

  const policy = await ensureOrganizationCadencePolicy(row.organizationId);
  const suppressed = Boolean(
    await findActiveSuppression(row.organizationId, row.contact.email, db),
  );
  const sentDrafts = row.emailDrafts.filter((draft) => draft.sentAt);
  const sentCount = sentDrafts.length;
  const latestSentAt = sentDrafts[0]?.sentAt ?? null;

  const autoStop = resolveAutoStopReason({
    status: row.status,
    campaignArchived: row.campaign.archivedAt != null,
    suppressed,
    sentCount,
    maxSequenceEmails: policy.maxSequenceEmails,
    existingReason: row.sequenceStoppedReason,
    existingStoppedAt: row.sequenceStoppedAt,
  });

  const cadenceActive =
    autoStop.reason == null &&
    latestSentAt != null &&
    sentCount > 0;

  const nextDueAt =
    cadenceActive && latestSentAt
      ? computeNextDueAt({
          latestSentAt,
          sentCount,
          policy,
        })
      : null;

  const data: Prisma.CampaignContactUpdateInput = {
    nextDueAt,
    sequenceStoppedAt: autoStop.stoppedAt,
    sequenceStoppedReason: autoStop.reason,
    ...(autoStop.reason &&
    (autoStop.reason === "SUPPRESSED" ||
      autoStop.reason === "EXCLUDED" ||
      autoStop.reason === "CAMPAIGN_ARCHIVED" ||
      autoStop.reason === "MAX_SEQUENCE")
      ? { sequenceStoppedBy: { disconnect: true } }
      : {}),
  };

  await db.campaignContact.update({
    where: { id: row.id },
    data,
  });

  return {
    campaignContactId: row.id,
    nextDueAt,
    sequenceStoppedAt: autoStop.stoppedAt,
    sequenceStoppedReason: autoStop.reason,
  };
}

/** Recompute materialized nextDueAt (and auto-stop reasons) for one contact. */
export async function recomputeCampaignContactCadence(
  campaignContactId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<RecomputeResult | null> {
  return recomputeOne(campaignContactId, db);
}

/** Batch recompute for many campaign contacts. */
export async function recomputeCampaignContactCadenceBatch(
  campaignContactIds: string[],
): Promise<number> {
  const unique = Array.from(new Set(campaignContactIds.filter(Boolean)));
  let updated = 0;
  for (const id of unique) {
    const result = await recomputeOne(id);
    if (result) updated += 1;
  }
  return updated;
}

/** Recompute all contacts in a campaign (e.g. on archive/unarchive). */
export async function recomputeCampaignCadenceForCampaign(
  campaignId: string,
  organizationId: string,
): Promise<number> {
  const contacts = await prisma.campaignContact.findMany({
    where: { campaignId, organizationId },
    select: { id: true },
  });
  return recomputeCampaignContactCadenceBatch(contacts.map((row) => row.id));
}

/** Recompute all campaign contacts for a suppressed/released email address. */
export async function recomputeCadenceForSuppressedEmail(
  organizationId: string,
  normalizedEmail: string,
): Promise<number> {
  const contacts = await prisma.contact.findMany({
    where: { organizationId, normalizedEmail },
    select: {
      campaignContacts: { select: { id: true } },
    },
  });
  const ids = contacts.flatMap((contact) =>
    contact.campaignContacts.map((row) => row.id),
  );
  return recomputeCampaignContactCadenceBatch(ids);
}
