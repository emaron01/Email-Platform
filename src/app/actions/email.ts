"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  requireCurrentUser,
  requireVerifiedForAiSpend,
} from "@/lib/auth/authz";
import {
  loadEmailGenerationContext,
  loadExistingEmailDraftContext,
  loadEmailReplyContext,
} from "@/lib/email-generation/context";
import {
  ADDITIONAL_GUIDANCE_MAX_CHARS,
  buildEmailPrompt,
  buildFollowUpEmailPrompt,
  buildReplyEmailPrompt,
} from "@/lib/email-generation/prompt";
import {
  generateEmailDraft,
  toSafeEmailGenerationError,
} from "@/lib/email-generation/service";
import {
  markEmailDraftSent,
  nextSequencePosition,
  recordEmailClientIntent,
  updateEmailDraftContent,
} from "@/lib/email-generation/sequence";
import {
  classifyProspectReply,
  PROSPECT_REPLY_MAX_CHARS,
} from "@/lib/email-generation/reply";
import { isMeetingSchedulingReply } from "@/lib/cadence/engine";
import { stopSequenceForContact } from "@/lib/cadence/stop-sequence";
import type { OfferConflict } from "@/lib/campaign/offer-validation";
import { unacknowledgedOfferWarnings } from "@/lib/email-generation/offer-warnings";
import type { AiMessage } from "@/lib/ai/types";
import {
  EMAIL_CLIENTS,
  type EmailClient,
  type EmailClientBodyHandling,
} from "@/lib/email-generation/email-body";
import { sendEmailDraftWithConnectedMailbox } from "@/lib/mailbox/send";
import { MailboxConnectionError } from "@/lib/mailbox/microsoft-oauth";
import { parseEmailLength } from "@/lib/campaign/save";
import type { EmailLength } from "@prisma/client";

export type GenerateEmailDraftActionResult = {
  ok: boolean;
  message: string;
  draftId?: string;
  subject?: string;
  body?: string;
  sequenceNumber?: number;
  kind?: "INITIAL" | "FOLLOW_UP" | "REPLY";
  status?: "DRAFT" | "SENT";
  replyClassification?:
    "INTERESTED" | "OBJECTION" | "REFERRAL" | "NOT_NOW" | "NOT_INTERESTED";
  referralSuggested?: boolean;
  offerWarnings?: OfferConflict[];
  claimConflicts?: import("@/lib/email-generation/claim-validation-contract").ClaimValidationViolation[];
  sentAt?: string;
  handoffAt?: string;
  sendUsage?: {
    used: number;
    warningLimit: number;
    limit: number;
    warning: boolean;
  };
  emailLength?: EmailLength;
  personaId?: string;
  personalizationTier?: string;
  personalizationSources?: string;
  recoveryAction?:
    | "RECONNECT"
    | "ASK_ADMIN"
    | "EDIT_DRAFT"
    | "RETRY"
    | "WAIT_RETRY"
    | "CONTACT_SUPPORT";
  noDraftNeeded?: boolean;
};

function revalidateCampaign(campaignId: string): void {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function generateEmailDraftAction(
  campaignContactId: string,
  additionalGuidance?: string,
  personaId?: string | null,
  emailLength?: string | null,
): Promise<GenerateEmailDraftActionResult> {
  const normalizedGuidance = additionalGuidance?.trim() || null;
  if (
    normalizedGuidance &&
    normalizedGuidance.length > ADDITIONAL_GUIDANCE_MAX_CHARS
  ) {
    return {
      ok: false,
      message: `What should change must be ${ADDITIONAL_GUIDANCE_MAX_CHARS} characters or fewer.`,
    };
  }

  try {
    const user = await requireVerifiedForAiSpend();
    const context = await loadEmailGenerationContext(
      campaignContactId,
      user.id,
      { personaId, emailLength: parseEmailLength(emailLength) },
    );
    const messages = buildEmailPrompt(context, normalizedGuidance);
    const draft = await generateEmailDraft(context, messages, {
      regenerationGuidance: normalizedGuidance,
    });

    revalidateCampaign(context.campaign.id);
    const hasClaimConflicts = draft.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? "Draft generated with claim conflicts. Review the flagged copy before sending."
        : draft.regenerated
          ? "Email draft regenerated."
          : "Email draft generated.",
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber: draft.sequenceNumber,
      kind: draft.kind,
      status: "DRAFT",
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: draft.claimConflicts,
      emailLength: draft.emailLength,
      personaId: draft.personaId,
      personalizationTier: draft.personalizationTier,
      personalizationSources: draft.personalizationSources,
    };
  } catch (error) {
    console.error("Email draft generation failed.", error);
    return {
      ok: false,
      message: toSafeEmailGenerationError(error),
    };
  }
}

export async function regenerateEmailDraftAction(
  emailDraftId: string,
  additionalGuidance?: string,
  personaId?: string | null,
  emailLength?: string | null,
): Promise<GenerateEmailDraftActionResult> {
  const normalizedGuidance = additionalGuidance?.trim() || null;
  if (
    normalizedGuidance &&
    normalizedGuidance.length > ADDITIONAL_GUIDANCE_MAX_CHARS
  ) {
    return {
      ok: false,
      message: `What should change must be ${ADDITIONAL_GUIDANCE_MAX_CHARS} characters or fewer.`,
    };
  }

  try {
    const user = await requireVerifiedForAiSpend();
    const { context, draft: existing } = await loadExistingEmailDraftContext(
      emailDraftId,
      user.id,
      { personaId, emailLength: parseEmailLength(emailLength) },
    );
    let messages: AiMessage[];
    if (existing.kind === "INITIAL") {
      messages = buildEmailPrompt(context, normalizedGuidance);
    } else if (existing.kind === "FOLLOW_UP") {
      messages = buildFollowUpEmailPrompt(
        context,
        existing.sequenceNumber,
        normalizedGuidance,
      );
    } else {
      const source = context.sequence.find(
        (draft) => draft.id === existing.inReplyToDraftId,
      );
      if (
        !source?.subject ||
        !source.body ||
        !existing.prospectReplyText ||
        !existing.replyClassification
      ) {
        return {
          ok: false,
          message: "This reply draft is missing its thread context.",
        };
      }
      messages = buildReplyEmailPrompt({
        context,
        sourceDraft: {
          sequenceNumber: source.sequenceNumber,
          subject: source.subject,
          body: source.body,
        },
        prospectReply: existing.prospectReplyText,
        classification: existing.replyClassification,
        additionalGuidance: normalizedGuidance,
      });
    }
    const regenerated = await generateEmailDraft(context, messages, {
      sequenceNumber: existing.sequenceNumber,
      kind: existing.kind,
      replyClassification: existing.replyClassification,
      prospectReplyText: existing.prospectReplyText,
      referralSuggested: existing.referralSuggested,
      inReplyToDraftId: existing.inReplyToDraftId,
      regenerationGuidance: normalizedGuidance,
    });
    revalidateCampaign(context.campaign.id);
    const hasClaimConflicts = regenerated.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? `Email ${existing.sequenceNumber} regenerated with claim conflicts. Review before sending.`
        : `Email ${existing.sequenceNumber} regenerated.`,
      draftId: regenerated.draftId,
      subject: regenerated.subject,
      body: regenerated.body,
      sequenceNumber: regenerated.sequenceNumber,
      kind: regenerated.kind,
      status: "DRAFT",
      replyClassification: regenerated.replyClassification ?? undefined,
      referralSuggested: regenerated.referralSuggested,
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: regenerated.claimConflicts,
      emailLength: regenerated.emailLength,
      personaId: regenerated.personaId,
      personalizationTier: regenerated.personalizationTier,
      personalizationSources: regenerated.personalizationSources,
    };
  } catch (error) {
    console.error("Email draft regeneration failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function addFollowUpEmailAction(
  campaignContactId: string,
  personaId?: string | null,
  emailLength?: string | null,
): Promise<GenerateEmailDraftActionResult> {
  try {
    const user = await requireVerifiedForAiSpend();
    const context = await loadEmailGenerationContext(
      campaignContactId,
      user.id,
      { personaId, emailLength: parseEmailLength(emailLength) },
    );
    const sequenceNumber = nextSequencePosition(context);
    const draft = await generateEmailDraft(
      context,
      buildFollowUpEmailPrompt(context, sequenceNumber),
      { sequenceNumber, kind: "FOLLOW_UP" },
    );
    revalidateCampaign(context.campaign.id);
    const hasClaimConflicts = draft.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? `Email ${sequenceNumber} added with claim conflicts. Review before sending.`
        : `Email ${sequenceNumber} added to the sequence.`,
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber,
      kind: "FOLLOW_UP",
      status: "DRAFT",
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: draft.claimConflicts,
      emailLength: draft.emailLength,
      personaId: draft.personaId,
      personalizationTier: draft.personalizationTier,
      personalizationSources: draft.personalizationSources,
    };
  } catch (error) {
    console.error("Follow-up email generation failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function markEmailDraftSentAction(
  emailDraftId: string,
): Promise<GenerateEmailDraftActionResult> {
  try {
    const user = await requireCurrentUser();
    const marked = await markEmailDraftSent({
      draftId: emailDraftId,
      userId: user.id,
    });
    revalidateCampaign(marked.campaignId);
    return {
      ok: true,
      message: marked.sendUsage?.warning
        ? `Marked as sent. Daily send warning: ${marked.sendUsage.used} of ${marked.sendUsage.limit} sends used. This is not a delivery confirmation.`
        : "Marked as sent based on your confirmation. This is not a delivery confirmation.",
      draftId: emailDraftId,
      sequenceNumber: marked.sequenceNumber,
      status: "SENT",
      sendUsage: marked.sendUsage,
    };
  } catch (error) {
    console.error("Failed to mark email draft as sent.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function saveEmailDraftAction(input: {
  emailDraftId: string;
  subject: string;
  body: string;
  emailLength?: string | null;
}): Promise<GenerateEmailDraftActionResult> {
  try {
    const user = await requireCurrentUser();
    const saved = await updateEmailDraftContent({
      draftId: input.emailDraftId,
      userId: user.id,
      subject: input.subject,
      body: input.body,
      emailLength: parseEmailLength(input.emailLength),
    });
    revalidateCampaign(saved.campaignId);
    return {
      ok: true,
      message:
        saved.claimConflicts.length > 0
          ? "Draft saved. Model-invented claims were re-checked and flagged."
          : "Draft saved.",
      draftId: input.emailDraftId,
      subject: saved.subject,
      body: saved.body,
      sequenceNumber: saved.sequenceNumber,
      status: "DRAFT",
      emailLength: saved.emailLength ?? undefined,
      claimConflicts: saved.claimConflicts,
    };
  } catch (error) {
    console.error("Failed to save email draft.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function recordEmailClientIntentAction(input: {
  emailDraftId: string;
  client: EmailClient;
  bodyHandling: EmailClientBodyHandling;
}): Promise<GenerateEmailDraftActionResult> {
  if (!EMAIL_CLIENTS.includes(input.client)) {
    return { ok: false, message: "Select a supported email client." };
  }
  if (input.bodyHandling !== "PREFILLED" && input.bodyHandling !== "COPIED") {
    return { ok: false, message: "Invalid email handoff mode." };
  }
  try {
    const user = await requireCurrentUser();
    const recorded = await recordEmailClientIntent({
      draftId: input.emailDraftId,
      userId: user.id,
      client: input.client,
      bodyHandling: input.bodyHandling,
    });
    return {
      ok: true,
      message:
        input.bodyHandling === "COPIED"
          ? "Email client opened with the full body copied for you to paste. This did not mark the email as sent."
          : "Email client opened. This did not mark the email as sent.",
      draftId: input.emailDraftId,
      sequenceNumber: recorded.sequenceNumber,
      handoffAt: recorded.occurredAt.toISOString(),
    };
  } catch (error) {
    console.error("Failed to record email client intent.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function sendEmailDraftConnectedAction(input: {
  emailDraftId: string;
  subject: string;
  body: string;
}): Promise<GenerateEmailDraftActionResult> {
  try {
    const user = await requireCurrentUser();
    const sent = await sendEmailDraftWithConnectedMailbox({
      draftId: input.emailDraftId,
      userId: user.id,
      subject: input.subject,
      body: input.body,
    });
    revalidateCampaign(sent.campaignId);
    return {
      ok: true,
      message: sent.sendUsage.warning
        ? `Microsoft accepted the message. Daily send warning: ${sent.sendUsage.used} of ${sent.sendUsage.limit} sends used.`
        : "Microsoft accepted the message from your mailbox and will save it to Sent items.",
      draftId: sent.draftId,
      sequenceNumber: sent.sequenceNumber,
      sentAt: sent.sentAt.toISOString(),
      sendUsage: sent.sendUsage,
    };
  } catch (error) {
    if (error instanceof MailboxConnectionError) {
      return {
        ok: false,
        message: error.message,
        recoveryAction: error.recovery,
      };
    }
    console.error("Failed to send email with connected mailbox.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function draftReplyAction(
  emailDraftId: string,
  prospectReply: string,
): Promise<GenerateEmailDraftActionResult> {
  const normalizedReply = prospectReply.trim();
  if (!normalizedReply) {
    return { ok: false, message: "Paste the prospect reply first." };
  }
  if (normalizedReply.length > PROSPECT_REPLY_MAX_CHARS) {
    return {
      ok: false,
      message: `Prospect reply must be ${PROSPECT_REPLY_MAX_CHARS} characters or fewer.`,
    };
  }

  try {
    const user = await requireVerifiedForAiSpend();
    const { context, sourceDraft } = await loadEmailReplyContext(
      emailDraftId,
      user.id,
    );
    const sequenceNumber = nextSequencePosition(context);
    const classification = await classifyProspectReply({
      context,
      sourceDraft,
      prospectReply: normalizedReply,
    });

    await stopSequenceForContact({
      campaignContactId: context.campaignContact.id,
      organizationId: context.organizationId,
      reason: "THEY_REPLIED",
      actorUserId: user.id,
    });

    if (
      isMeetingSchedulingReply(
        classification.classification,
        normalizedReply,
      )
    ) {
      await prisma.emailDraft.update({
        where: { id: sourceDraft.id },
        data: { prospectReplyText: normalizedReply },
      });
      revalidateCampaign(context.campaign.id);
      return {
        ok: true,
        message:
          "No draft needed — reply in your inbox. Cadence stopped because they replied.",
        noDraftNeeded: true,
        replyClassification: classification.classification,
      };
    }

    const draft = await generateEmailDraft(
      context,
      buildReplyEmailPrompt({
        context,
        sourceDraft,
        prospectReply: normalizedReply,
        classification: classification.classification,
      }),
      {
        sequenceNumber,
        kind: "REPLY",
        replyClassification: classification.classification,
        prospectReplyText: normalizedReply,
        referralSuggested: classification.referralSuggested,
        inReplyToDraftId: sourceDraft.id,
        repReplyContext: normalizedReply,
      },
    );
    revalidateCampaign(context.campaign.id);
    revalidatePath("/");
    const hasClaimConflicts = draft.claimConflicts.length > 0;
    return {
      ok: true,
      message: hasClaimConflicts
        ? `Reply drafted as Email ${sequenceNumber} with claim conflicts. Copy and send from your inbox — this app does not send replies. Cadence stopped.`
        : classification.classification === "REFERRAL"
          ? `Reply drafted as Email ${sequenceNumber}. Copy and send from your inbox — this app does not send replies. A new contact may need to be added. Cadence stopped.`
          : `Reply drafted as Email ${sequenceNumber}. Copy and send from your inbox — this app does not send replies. Cadence stopped.`,
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber,
      kind: "REPLY",
      status: "DRAFT",
      replyClassification: classification.classification,
      referralSuggested: classification.referralSuggested,
      offerWarnings: unacknowledgedOfferWarnings(context),
      claimConflicts: draft.claimConflicts,
      emailLength: draft.emailLength,
      personaId: draft.personaId,
      personalizationTier: draft.personalizationTier,
      personalizationSources: draft.personalizationSources,
    };
  } catch (error) {
    console.error("Reply draft generation failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}
