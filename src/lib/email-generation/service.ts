import "server-only";

import type { EmailDraftKind, ReplyClassification } from "@prisma/client";
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
  getEmailAiConfig,
  getEmailAiProvider,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiMessage } from "@/lib/ai/types";
import { validateGeneratedEmailClaims } from "@/lib/email-generation/claim-validation";
import { normalizeEmailBody } from "@/lib/email-generation/email-body";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  contactResearchForPrompt,
  personalizationSourceSummary,
  resolvePersonalization,
} from "@/lib/email-generation/personalization";
import { EMAIL_GENERATION_PROMPT_VERSION } from "@/lib/email-generation/prompt";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { assertUsageAllowed, UsageQuotaError } from "@/lib/usage/quota";

export const EMAIL_GENERATION_MODEL = "gpt-5.6-luna";

export function removeEmDashes(value: string): string {
  return value.replace(/[ \t]*—[ \t]*/g, ", ").trim();
}

const SIGN_OFF_LINE =
  /^(?:best(?: regards)?|kind regards|warm regards|regards|sincerely|thanks(?: again)?|thank you|cheers|respectfully)[,.!\s]*$/i;
const SENDER_PLACEHOLDER_LINE =
  /^(?:\[(?:your )?(?:name|signature)\]|<your (?:name|signature)>|\{your (?:name|signature)\})[,.!\s]*$/i;

export function sanitizeGeneratedEmailBody(value: string): string {
  const normalized = normalizeEmailBody(removeEmDashes(value));
  const inlineGreeting =
    /^((?:hi|hello|hey|good morning|good afternoon|good evening)\s+[^,\n]{1,60},)[ \t]+(.+)$/i.exec(
      normalized,
    );
  const lines = (
    inlineGreeting ? `${inlineGreeting[1]}\n\n${inlineGreeting[2]}` : normalized
  ).split("\n");
  const greetingLine =
    /^(?:(?:hi|hello|hey|good morning|good afternoon|good evening)\b.+|[\p{L}'-]+(?:\s+[\p{L}'-]+)?)[,:!]$/iu;
  if (
    lines.length > 1 &&
    greetingLine.test(lines[0].trim()) &&
    lines[1].trim() !== ""
  ) {
    lines.splice(1, 0, "");
  }
  const firstPossibleSignatureLine = Math.max(0, lines.length - 8);

  for (
    let index = firstPossibleSignatureLine;
    index < lines.length;
    index += 1
  ) {
    const line = lines[index].trim();
    if (SIGN_OFF_LINE.test(line) || SENDER_PLACEHOLDER_LINE.test(line)) {
      return lines.slice(0, index).join("\n").trimEnd();
    }
  }

  return lines.join("\n").trim();
}

function normalizedComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(?:hi|hello|hey)\s+[^,]+,\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function openingSentence(body: string): string {
  return (
    body
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .find(Boolean) ?? ""
  );
}

function closingQuestion(body: string): string {
  const questions = body.match(/[^.!?\n]*\?/g) ?? [];
  return questions.at(-1)?.trim() ?? "";
}

export function assertFollowUpNovelty(
  body: string,
  priorEmails: Array<{ body: string | null }>,
): void {
  const opening = normalizedComparable(openingSentence(body));
  const ask = normalizedComparable(closingQuestion(body));
  for (const prior of priorEmails) {
    if (!prior.body) continue;
    const priorOpening = normalizedComparable(openingSentence(prior.body));
    const priorAsk = normalizedComparable(closingQuestion(prior.body));
    if (opening && opening === priorOpening) {
      throw new AiValidationError("Follow-up repeated a prior email opening.");
    }
    if (ask && ask === priorAsk) {
      throw new AiValidationError(
        "Follow-up repeated a prior email closing ask.",
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiTimeoutError) return true;
  if (error instanceof AiProviderError) return error.retryable;
  return false;
}

async function withRetries<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  onRetry: () => void,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof AiValidationError ||
        error instanceof AiConfigError ||
        error instanceof TenantError
      ) {
        throw error;
      }
      if (!isRetryable(error) || attempt >= maxRetries) throw error;
      const delay = Math.min(2000 * 2 ** attempt, 8000);
      await sleep(delay);
      attempt += 1;
      onRetry();
    }
  }
}

export function toSafeEmailGenerationError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof UsageQuotaError) return error.message;
  if (
    error instanceof Error &&
    error.message === "Verify your email address to continue with this action."
  ) {
    return error.message;
  }
  if (error instanceof AiConfigError) {
    return "Email generation AI is not configured.";
  }
  if (error instanceof AiTimeoutError) {
    return "Email generation timed out. Please try again.";
  }
  if (error instanceof AiValidationError) {
    return "Email generation returned an invalid draft. Please try again.";
  }
  if (error instanceof AiProviderError) {
    return "Email generation is temporarily unavailable. Please try again.";
  }
  return "Unable to generate this email. Please try again.";
}

export async function generateEmailDraft(
  context: EmailGenerationContext,
  messages: AiMessage[],
  options: {
    sequenceNumber?: number;
    kind?: EmailDraftKind;
    replyClassification?: ReplyClassification | null;
    prospectReplyText?: string | null;
    referralSuggested?: boolean;
    inReplyToDraftId?: string | null;
  } = {},
): Promise<{
  draftId: string;
  subject: string;
  body: string;
  regenerated: boolean;
  sequenceNumber: number;
  kind: EmailDraftKind;
  replyClassification: ReplyClassification | null;
  referralSuggested: boolean;
  emailLength: EmailGenerationContext["emailLength"];
  personaId: string;
  personalizationTier: string;
  personalizationSources: string;
}> {
  const sequenceNumber = options.sequenceNumber ?? 1;
  const kind = options.kind ?? (sequenceNumber === 1 ? "INITIAL" : "FOLLOW_UP");
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new TenantError(
      "Email sequence position must be a positive integer.",
    );
  }
  const {
    assertCampaignNotArchived,
    assertEmailNotSuppressed,
  } = await import("@/lib/suppression/service");
  await assertCampaignNotArchived(
    context.organizationId,
    context.campaign.id,
  );
  await assertEmailNotSuppressed(
    context.organizationId,
    context.contact.email,
  );
  const existing = await prisma.emailDraft.findUnique({
    where: {
      organizationId_campaignContactId_sequenceNumber: {
        organizationId: context.organizationId,
        campaignContactId: context.campaignContact.id,
        sequenceNumber,
      },
    },
    select: { id: true, status: true, sentAt: true },
  });
  if (existing?.status === "SENT" || existing?.sentAt) {
    throw new TenantError(
      "Sent emails are read-only and cannot be regenerated.",
    );
  }
  const regenerated = Boolean(existing);
  if (sequenceNumber > 1) {
    const previous = context.sequence.find(
      (draft) => draft.sequenceNumber === sequenceNumber - 1,
    );
    if (previous?.status !== "SENT" || !previous.sentAt) {
      throw new TenantError(
        `Email ${sequenceNumber - 1} must be marked as sent before Email ${sequenceNumber} can be generated.`,
      );
    }
  }
  if (kind === "REPLY") {
    const source = context.sequence.find(
      (draft) => draft.id === options.inReplyToDraftId,
    );
    if (source?.status !== "SENT" || !source.sentAt) {
      throw new TenantError("Replies can only be drafted from a sent email.");
    }
  }

  const started = Date.now();
  let retryCount = 0;
  let provider: string | null = null;
  let model: string | null = null;

  try {
    await assertUsageAllowed({
      organizationId: context.organizationId,
      userId: context.userId,
      resource: "EMAIL_GENERATION",
    });
    const config = getEmailAiConfig();
    if (config.model !== EMAIL_GENERATION_MODEL) {
      throw new AiConfigError(
        `EMAIL_AI_MODEL must be ${EMAIL_GENERATION_MODEL}.`,
      );
    }
    provider = config.provider;
    model = config.model;

    const ai = getEmailAiProvider();
    const response = await withRetries(
      () =>
        ai.generateStructured({
          ...structuredOutputRequest("emailDraftGeneration"),
          messages,
        }),
      config.maxRetries,
      () => {
        retryCount += 1;
      },
    );
    const subject = removeEmDashes(response.data.subject);
    const body = sanitizeGeneratedEmailBody(response.data.body);
    const priorSentEmails = context.sequence.filter(
      (draft) =>
        draft.sequenceNumber < sequenceNumber &&
        draft.status === "SENT" &&
        draft.sentAt,
    );
    if (kind === "FOLLOW_UP") {
      assertFollowUpNovelty(body, priorSentEmails);
    }
    const claimValidation = await validateGeneratedEmailClaims({
      ai,
      context,
      subject,
      body,
    });
    if (claimValidation.violations.length > 0) {
      throw new AiValidationError(
        "Generated email conflicts with product claims or offer evidence.",
        {
          issues: claimValidation.violations.map((violation) => ({
            path: "body",
            code: violation.type,
            expected: violation.description,
          })),
          usage: claimValidation.response.usage,
        },
      );
    }

    const personalization = resolvePersonalization({
      companyResearch: context.companyResearch,
      contactResearch: contactResearchForPrompt(context.contactResearch),
    });
    const emailLength = context.emailLength ?? context.campaign.emailLength;
    const personalizationSources = personalizationSourceSummary(personalization);

    const draft = await prisma.emailDraft.upsert({
      where: {
        organizationId_campaignContactId_sequenceNumber: {
          organizationId: context.organizationId,
          campaignContactId: context.campaignContact.id,
          sequenceNumber,
        },
      },
      create: {
        organizationId: context.organizationId,
        campaignContactId: context.campaignContact.id,
        sequenceNumber,
        subject,
        body,
        generatedBody: body,
        status: "DRAFT",
        source: "AI",
        kind,
        replyClassification: options.replyClassification ?? null,
        prospectReplyText: options.prospectReplyText?.trim() || null,
        referralSuggested: options.referralSuggested ?? false,
        inReplyToDraftId: options.inReplyToDraftId ?? null,
        emailLength,
        personaId: context.persona.id,
        personalizationTier: personalization.tier,
        personalizationSources,
      },
      update: {
        subject,
        body,
        generatedBody: body,
        status: "DRAFT",
        source: "AI",
        kind,
        replyClassification: options.replyClassification ?? null,
        prospectReplyText: options.prospectReplyText?.trim() || null,
        referralSuggested: options.referralSuggested ?? false,
        inReplyToDraftId: options.inReplyToDraftId ?? null,
        emailLength,
        personaId: context.persona.id,
        personalizationTier: personalization.tier,
        personalizationSources,
      },
    });

    await recordUsageEvent({
      organizationId: context.organizationId,
      userId: context.userId,
      campaignId: context.campaign.id,
      contactId: context.contact.id,
      category: "EMAIL_GENERATION",
      operation: "EMAIL_DRAFT_CREATED",
      provider: response.provider,
      model: response.model,
      inputTokens:
        (response.usage?.inputTokens ?? 0) +
          (claimValidation.response.usage?.inputTokens ?? 0) || null,
      outputTokens:
        (response.usage?.outputTokens ?? 0) +
          (claimValidation.response.usage?.outputTokens ?? 0) || null,
      status: "SUCCESS",
      retryCount,
      durationMs: Date.now() - started,
      metadata: {
        campaignContactId: context.campaignContact.id,
        draftId: draft.id,
        sequenceNumber: draft.sequenceNumber,
        source: draft.source,
        promptVersion: EMAIL_GENERATION_PROMPT_VERSION,
        usedContactResearch: Boolean(context.contactResearch),
        usedVoiceSample: context.voiceSamples.length > 0,
        regenerated,
        kind,
        claimValidationCompleted: true,
      },
    });

    return {
      draftId: draft.id,
      subject,
      body,
      regenerated,
      sequenceNumber: draft.sequenceNumber,
      kind: draft.kind,
      replyClassification: draft.replyClassification,
      referralSuggested: draft.referralSuggested,
      emailLength: draft.emailLength ?? emailLength,
      personaId: draft.personaId ?? context.persona.id,
      personalizationTier: draft.personalizationTier ?? personalization.tier,
      personalizationSources:
        draft.personalizationSources ?? personalizationSources,
    };
  } catch (error) {
    await recordUsageEvent({
      organizationId: context.organizationId,
      userId: context.userId,
      campaignId: context.campaign.id,
      contactId: context.contact.id,
      category: "EMAIL_GENERATION",
      operation: "EMAIL_DRAFT_CREATED",
      provider,
      model,
      status: "FAILED",
      retryCount,
      durationMs: Date.now() - started,
      metadata: {
        campaignContactId: context.campaignContact.id,
        sequenceNumber,
        kind,
        promptVersion: EMAIL_GENERATION_PROMPT_VERSION,
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
      },
    });
    throw error;
  }
}
