import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_BODY_MAX_CHARS,
  EMAIL_SUBJECT_MAX_CHARS,
  normalizeEmailBody,
} from "@/lib/email-generation/email-body";
import { getConnectedEmailProvider } from "@/lib/mailbox/provider";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";

const STALE_SEND_ATTEMPT_MS = 5 * 60 * 1000;

export type ConnectedSendResult = {
  draftId: string;
  campaignId: string;
  sequenceNumber: number;
  sentAt: Date;
  providerMessageId: string | null;
  providerRequestId: string | null;
};

export async function sendEmailDraftWithConnectedMailbox(input: {
  draftId: string;
  userId: string;
  subject: string;
  body: string;
}): Promise<ConnectedSendResult> {
  const subject = input.subject.trim();
  const body = normalizeEmailBody(input.body).trim();
  if (!subject) throw new TenantError("Email subject is required.");
  if (subject.length > EMAIL_SUBJECT_MAX_CHARS) {
    throw new TenantError(
      `Email subject must be ${EMAIL_SUBJECT_MAX_CHARS} characters or fewer.`,
    );
  }
  if (!body) throw new TenantError("Email body is required.");
  if (body.length > EMAIL_BODY_MAX_CHARS) {
    throw new TenantError(
      `Email body must be ${EMAIL_BODY_MAX_CHARS} characters or fewer.`,
    );
  }
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
      status: true,
      sentAt: true,
      campaignContactId: true,
      sequenceNumber: true,
      campaignContact: {
        select: {
          campaignId: true,
          contactId: true,
          contact: { select: { email: true } },
        },
      },
    },
  });
  if (!draft) {
    throw new TenantError(
      "Email draft does not belong to the active organization.",
    );
  }
  if (draft.status === "SENT" || draft.sentAt) {
    throw new TenantError("This email has already been sent.");
  }
  const recipient = draft.campaignContact.contact.email?.trim();
  if (!recipient) {
    throw new TenantError("Add an email address to this contact before sending.");
  }

  const attemptId = randomUUID();
  const claimed = await prisma.emailDraft.updateMany({
    where: {
      id: draft.id,
      organizationId,
      sentAt: null,
      OR: [
        { status: { in: ["DRAFT", "APPROVED"] } },
        {
          status: "SENDING",
          sendAttemptStartedAt: {
            lt: new Date(Date.now() - STALE_SEND_ATTEMPT_MS),
          },
        },
      ],
    },
    data: {
      subject,
      body,
      status: "SENDING",
      sendAttemptId: attemptId,
      sendAttemptStartedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new TenantError(
      "This email is already being sent. Wait for the current attempt to finish.",
    );
  }

  try {
    const provider = await getConnectedEmailProvider("MICROSOFT_365");
    const sent = await provider.send({
      organizationId,
      userId: input.userId,
      to: recipient,
      subject,
      body,
    });
    const completed = await prisma.emailDraft.updateMany({
      where: {
        id: draft.id,
        organizationId,
        status: "SENDING",
        sendAttemptId: attemptId,
      },
      data: {
        status: "SENT",
        sentAt: sent.acceptedAt,
        sentMethod: "CONNECTED_PROVIDER",
        sentByUserId: input.userId,
        sendAttemptId: null,
        sendAttemptStartedAt: null,
      },
    });
    if (completed.count !== 1) {
      throw new Error("Connected send state could not be finalized.");
    }
    try {
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
          sentMethod: "CONNECTED_PROVIDER",
          provider: sent.provider,
          providerMessageId: sent.providerMessageId,
          providerRequestId: sent.providerRequestId,
          acceptedByProvider: true,
        },
      });
    } catch (usageError) {
      console.error("Failed to record connected-send usage.", usageError);
    }
    return {
      draftId: draft.id,
      campaignId: draft.campaignContact.campaignId,
      sequenceNumber: draft.sequenceNumber,
      sentAt: sent.acceptedAt,
      providerMessageId: sent.providerMessageId,
      providerRequestId: sent.providerRequestId,
    };
  } catch (error) {
    await prisma.emailDraft.updateMany({
      where: {
        id: draft.id,
        organizationId,
        status: "SENDING",
        sendAttemptId: attemptId,
      },
      data: {
        status: "DRAFT",
        sendAttemptId: null,
        sendAttemptStartedAt: null,
      },
    });
    throw error;
  }
}
