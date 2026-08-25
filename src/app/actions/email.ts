"use server";

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
  sentAt?: string;
  handoffAt?: string;
  sendUsage?: {
    used: number;
    warningLimit: number;
    limit: number;
    warning: boolean;
  };
  recoveryAction?:
    | "RECONNECT"
    | "ASK_ADMIN"
    | "EDIT_DRAFT"
    | "RETRY"
    | "WAIT_RETRY"
    | "CONTACT_SUPPORT";
};

function revalidateCampaign(campaignId: string): void {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function generateEmailDraftAction(
  campaignContactId: string,
  additionalGuidance?: string,
  personaId?: string | null,
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
      { personaId },
    );
    const messages = buildEmailPrompt(context, normalizedGuidance);
    const draft = await generateEmailDraft(context, messages);

    revalidateCampaign(context.campaign.id);
    return {
      ok: true,
      message: draft.regenerated
        ? "Email draft regenerated."
        : "Email draft generated.",
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber: draft.sequenceNumber,
      kind: draft.kind,
      status: "DRAFT",
      offerWarnings: unacknowledgedOfferWarnings(context),
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
      { personaId },
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
    });
    revalidateCampaign(context.campaign.id);
    return {
      ok: true,
      message: `Email ${existing.sequenceNumber} regenerated.`,
      draftId: regenerated.draftId,
      subject: regenerated.subject,
      body: regenerated.body,
      sequenceNumber: regenerated.sequenceNumber,
      kind: regenerated.kind,
      status: "DRAFT",
      replyClassification: regenerated.replyClassification ?? undefined,
      referralSuggested: regenerated.referralSuggested,
      offerWarnings: unacknowledgedOfferWarnings(context),
    };
  } catch (error) {
    console.error("Email draft regeneration failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}

export async function addFollowUpEmailAction(
  campaignContactId: string,
): Promise<GenerateEmailDraftActionResult> {
  try {
    const user = await requireVerifiedForAiSpend();
    const context = await loadEmailGenerationContext(
      campaignContactId,
      user.id,
    );
    const sequenceNumber = nextSequencePosition(context);
    const draft = await generateEmailDraft(
      context,
      buildFollowUpEmailPrompt(context, sequenceNumber),
      { sequenceNumber, kind: "FOLLOW_UP" },
    );
    revalidateCampaign(context.campaign.id);
    return {
      ok: true,
      message: `Email ${sequenceNumber} added to the sequence.`,
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber,
      kind: "FOLLOW_UP",
      status: "DRAFT",
      offerWarnings: unacknowledgedOfferWarnings(context),
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
}): Promise<GenerateEmailDraftActionResult> {
  try {
    const user = await requireCurrentUser();
    const saved = await updateEmailDraftContent({
      draftId: input.emailDraftId,
      userId: user.id,
      subject: input.subject,
      body: input.body,
    });
    revalidateCampaign(saved.campaignId);
    return {
      ok: true,
      message: "Draft saved.",
      draftId: input.emailDraftId,
      subject: saved.subject,
      body: saved.body,
      sequenceNumber: saved.sequenceNumber,
      status: "DRAFT",
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
      },
    );
    revalidateCampaign(context.campaign.id);
    return {
      ok: true,
      message:
        classification.classification === "REFERRAL"
          ? `Reply drafted as Email ${sequenceNumber}. A new contact may need to be added.`
          : `Reply drafted as Email ${sequenceNumber}.`,
      draftId: draft.draftId,
      subject: draft.subject,
      body: draft.body,
      sequenceNumber,
      kind: "REPLY",
      status: "DRAFT",
      replyClassification: classification.classification,
      referralSuggested: classification.referralSuggested,
      offerWarnings: unacknowledgedOfferWarnings(context),
    };
  } catch (error) {
    console.error("Reply draft generation failed.", error);
    return { ok: false, message: toSafeEmailGenerationError(error) };
  }
}
