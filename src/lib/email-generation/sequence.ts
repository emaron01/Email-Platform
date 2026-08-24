import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import type { EmailGenerationContext } from "@/lib/email-generation/context";

export function nextSequencePosition(context: EmailGenerationContext): number {
  const latest = context.sequence.at(-1);
  if (!latest) {
    throw new TenantError("Generate the initial email before adding a follow-up.");
  }
  if (latest.status !== "SENT" || !latest.sentAt) {
    throw new TenantError(
      `Email ${latest.sequenceNumber} must be marked as sent before another email can be added.`,
    );
  }
  return latest.sequenceNumber + 1;
}

export async function markEmailDraftSent(input: {
  draftId: string;
  userId: string;
}): Promise<{
  campaignId: string;
  campaignContactId: string;
  sequenceNumber: number;
  sentAt: Date;
}> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;
  const draft = await prisma.emailDraft.findFirst({
    where: { id: input.draftId, organizationId },
    select: {
      id: true,
      campaignContactId: true,
      sequenceNumber: true,
      status: true,
      sentAt: true,
      campaignContact: { select: { campaignId: true, contactId: true } },
    },
  });
  if (!draft) {
    throw new TenantError(
      "Email draft does not belong to the active organization.",
    );
  }
  if (draft.status === "SENT" && draft.sentAt) {
    return {
      campaignId: draft.campaignContact.campaignId,
      campaignContactId: draft.campaignContactId,
      sequenceNumber: draft.sequenceNumber,
      sentAt: draft.sentAt,
    };
  }
  if (draft.status !== "DRAFT" && draft.status !== "APPROVED") {
    throw new TenantError("Only a completed draft can be marked as sent.");
  }

  const sentAt = new Date();
  await prisma.emailDraft.update({
    where: { id: draft.id },
    data: {
      status: "SENT",
      sentAt,
      sentMethod: "MANUAL_ASSERTION",
      sentByUserId: input.userId,
    },
  });
  await recordUsageEvent({
    organizationId,
    userId: input.userId,
    campaignId: draft.campaignContact.campaignId,
    contactId: draft.campaignContact.contactId,
    category: "EMAIL_GENERATION",
    operation: "EMAIL_DRAFT_SENT",
    status: "SUCCESS",
    metadata: {
      draftId: draft.id,
      sequenceNumber: draft.sequenceNumber,
      sentMethod: "MANUAL_ASSERTION",
      deliveryConfirmed: false,
    },
  });
  return {
    campaignId: draft.campaignContact.campaignId,
    campaignContactId: draft.campaignContactId,
    sequenceNumber: draft.sequenceNumber,
    sentAt,
  };
}
