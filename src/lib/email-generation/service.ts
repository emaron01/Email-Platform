import "server-only";

import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
  getEmailAiConfig,
  getEmailAiProvider,
} from "@/lib/ai";
import type { AiMessage } from "@/lib/ai/types";
import { emailDraftGenerationSchema } from "@/lib/email-generation/contract";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import { EMAIL_GENERATION_PROMPT_VERSION } from "@/lib/email-generation/prompt";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";

export const EMAIL_GENERATION_MODEL = "gpt-5.6-luna";

export function removeEmDashes(value: string): string {
  return value.replace(/[ \t]*—[ \t]*/g, ", ").trim();
}

const SIGN_OFF_LINE =
  /^(?:best(?: regards)?|kind regards|warm regards|regards|sincerely|thanks(?: again)?|thank you|cheers|respectfully)[,.!\s]*$/i;
const SENDER_PLACEHOLDER_LINE =
  /^(?:\[(?:your )?(?:name|signature)\]|<your (?:name|signature)>|\{your (?:name|signature)\})[,.!\s]*$/i;

export function sanitizeGeneratedEmailBody(value: string): string {
  const lines = removeEmDashes(value).split(/\r?\n/);
  const firstPossibleSignatureLine = Math.max(0, lines.length - 8);

  for (let index = firstPossibleSignatureLine; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (SIGN_OFF_LINE.test(line) || SENDER_PLACEHOLDER_LINE.test(line)) {
      return lines.slice(0, index).join("\n").trimEnd();
    }
  }

  return lines.join("\n").trim();
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
  messages: [AiMessage, AiMessage],
): Promise<{
  draftId: string;
  subject: string;
  body: string;
}> {
  const existing = await prisma.emailDraft.findFirst({
    where: {
      organizationId: context.organizationId,
      campaignContactId: context.campaignContact.id,
    },
    select: { id: true },
  });
  if (existing) {
    throw new TenantError(
      "An email draft already exists for this campaign contact.",
    );
  }

  const started = Date.now();
  let retryCount = 0;
  let provider: string | null = null;
  let model: string | null = null;

  try {
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
          messages,
          schema: emailDraftGenerationSchema,
          schemaName: "email_draft_generation",
        }),
      config.maxRetries,
      () => {
        retryCount += 1;
      },
    );
    const subject = removeEmDashes(response.data.subject);
    const body = sanitizeGeneratedEmailBody(response.data.body);

    const draft = await prisma.emailDraft.create({
      data: {
        organizationId: context.organizationId,
        campaignContactId: context.campaignContact.id,
        sequenceNumber: 1,
        subject,
        body,
        status: "DRAFT",
        source: "AI",
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
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
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
      },
    });

    return {
      draftId: draft.id,
      subject,
      body,
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
        promptVersion: EMAIL_GENERATION_PROMPT_VERSION,
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
      },
    });
    throw error;
  }
}
