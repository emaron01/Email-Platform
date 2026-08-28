import "server-only";

import type { EmailDraftKind, ReplyClassification } from "@prisma/client";
import { Prisma } from "@prisma/client";
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
import {
  bodyReferencesRequiredSpecific,
  selectRequiredMotionSpecifics,
} from "@/lib/email-generation/motion-specifics";
import { ensureContactResearchForEmailGeneration } from "@/lib/email-generation/context";
import {
  emailGenerationFailureUsageMetadata,
  classifyEmailGenerationError,
  logEmailGenerationValidationFailure,
} from "@/lib/email-generation/errors";
import { EMAIL_GENERATION_PROMPT_VERSION } from "@/lib/email-generation/prompt";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { assertUsageAllowed } from "@/lib/usage/quota";

export { toSafeEmailGenerationError } from "@/lib/email-generation/errors";

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

export async function generateEmailDraft(
  inputContext: EmailGenerationContext,
  messages: AiMessage[],
  options: {
    sequenceNumber?: number;
    kind?: EmailDraftKind;
    replyClassification?: ReplyClassification | null;
    prospectReplyText?: string | null;
    referralSuggested?: boolean;
    inReplyToDraftId?: string | null;
    regenerationGuidance?: string | null;
    repReplyContext?: string | null;
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
  claimConflicts: import("@/lib/email-generation/claim-validation-contract").ClaimValidationViolation[];
}> {
  let context = inputContext;
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
    context = await ensureContactResearchForEmailGeneration(context);
    const config = getEmailAiConfig();
    provider = config.provider;
    model = config.model;

    const ai = getEmailAiProvider();
    let response = await withRetries(
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
    let subject = removeEmDashes(response.data.subject);
    let body = sanitizeGeneratedEmailBody(response.data.body);

    const personalizationForSpecifics = resolvePersonalization({
      companyResearch: context.companyResearch,
      contactResearch: contactResearchForPrompt(context.contactResearch),
    });
    const requiredMotionSpecifics =
      personalizationForSpecifics.companyResearchUsable
        ? selectRequiredMotionSpecifics({
            research: personalizationForSpecifics.companyResearch,
            problemSpace: {
              problemsSolved: context.product.problemsSolved,
              painPoints: context.persona.painPoints,
            },
            contactTitle: context.contact.title,
          })
        : [];
    let requiredMotionSpecificRetry = false;
    let requiredMotionSpecificReferenced = bodyReferencesRequiredSpecific(
      body,
      requiredMotionSpecifics,
    );
    if (
      requiredMotionSpecifics.length > 0 &&
      !requiredMotionSpecificReferenced
    ) {
      requiredMotionSpecificRetry = true;
      retryCount += 1;
      const requiredNames = requiredMotionSpecifics
        .map((item) => item.text)
        .join(" | ");
      const retryMessages: AiMessage[] = [
        ...messages,
        {
          role: "user",
          content: `The previous draft did not reason from a required company specific. Rewrite the full email as JSON only. Reason FROM at least one of these by name to the executive problem (do not bolt it on; do not quote headcount or LinkedIn): ${requiredNames}. Keep paragraph 1 focused on the executive problem; do not open with product capabilities.`,
        },
      ];
      response = await withRetries(
        () =>
          ai.generateStructured({
            ...structuredOutputRequest("emailDraftGeneration"),
            messages: retryMessages,
          }),
        config.maxRetries,
        () => {
          retryCount += 1;
        },
      );
      subject = removeEmDashes(response.data.subject);
      body = sanitizeGeneratedEmailBody(response.data.body);
      requiredMotionSpecificReferenced = bodyReferencesRequiredSpecific(
        body,
        requiredMotionSpecifics,
      );
    }

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
      regenerationGuidance: options.regenerationGuidance,
    });
    const claimConflicts = claimValidation.violations;

    const personalization = resolvePersonalization({
      companyResearch: context.companyResearch,
      contactResearch: contactResearchForPrompt(context.contactResearch),
    });
    const emailLength = context.emailLength ?? context.campaign.emailLength;
    const personalizationSources = personalizationSourceSummary(personalization);

    // Always persist the draft — claim conflicts are reviewable, not discarded.
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
        repReplyContext: options.repReplyContext?.trim() || null,
        emailLength,
        personaId: context.persona.id,
        personalizationTier: personalization.tier,
        personalizationSources,
        claimConflictsJson:
          claimConflicts.length > 0 ? claimConflicts : undefined,
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
        repReplyContext: options.repReplyContext?.trim() || null,
        emailLength,
        personaId: context.persona.id,
        personalizationTier: personalization.tier,
        personalizationSources,
        claimConflictsJson:
          claimConflicts.length > 0 ? claimConflicts : Prisma.DbNull,
      },
    });

    if (claimConflicts.length > 0) {
      const { claimViolationsToIssues } = await import(
        "@/lib/email-generation/claim-conflicts"
      );
      const { classifyEmailGenerationError, logEmailGenerationValidationFailure } =
        await import("@/lib/email-generation/errors");
      const claimError = new AiValidationError(
        "Generated email conflicts with product claims or offer evidence.",
        {
          issues: claimViolationsToIssues(claimConflicts),
          usage: {
            inputTokens:
              (response.usage?.inputTokens ?? 0) +
              (claimValidation.response.usage?.inputTokens ?? 0),
            outputTokens:
              (response.usage?.outputTokens ?? 0) +
              (claimValidation.response.usage?.outputTokens ?? 0),
          },
          rawTextPreview: JSON.stringify({ subject, body }).slice(0, 800),
        },
      );
      const classified = classifyEmailGenerationError(
        claimError,
        "claimValidation",
      );
      logEmailGenerationValidationFailure({
        organizationId: context.organizationId,
        campaignId: context.campaign.id,
        campaignContactId: context.campaignContact.id,
        provider: response.provider,
        model: response.model,
        classified,
        rawTextPreview: claimError.rawTextPreview ?? null,
        durationMs: Date.now() - started,
        retryCount,
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
          personalizationTier: personalization.tier,
          companyResearchUsed: personalization.companyResearchUsable,
          usedContactResearch: personalization.contactResearchUsable,
          requiredMotionSpecifics: requiredMotionSpecifics.map(
            (item) => item.text,
          ),
          requiredMotionSpecificReferenced,
          requiredMotionSpecificRetry,
          requiredMotionSpecificMissing:
            requiredMotionSpecifics.length > 0 &&
            !requiredMotionSpecificReferenced,
          regenerated,
          kind,
          claimValidationCompleted: true,
          claimConflictCount: claimConflicts.length,
          claimConflicts: claimViolationsToIssues(claimConflicts),
          errorCategory: "VALIDATION",
          stage: "claimValidation",
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
        claimConflicts,
      };
    }

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
        personalizationTier: personalization.tier,
        companyResearchUsed: personalization.companyResearchUsable,
        usedContactResearch: personalization.contactResearchUsable,
        usedVoiceSample: context.voiceSamples.length > 0,
        requiredMotionSpecifics: requiredMotionSpecifics.map(
          (item) => item.text,
        ),
        requiredMotionSpecificReferenced,
        requiredMotionSpecificRetry,
        requiredMotionSpecificMissing:
          requiredMotionSpecifics.length > 0 &&
          !requiredMotionSpecificReferenced,
        regenerated,
        kind,
        claimValidationCompleted: true,
        claimConflictCount: 0,
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
      claimConflicts: [],
    };
  } catch (error) {
    const classified = classifyEmailGenerationError(error);
    const failureMeta = emailGenerationFailureUsageMetadata(error, classified);
    const usage =
      error instanceof AiValidationError ? error.usage : undefined;

    if (
      classified.category === "VALIDATION" ||
      error instanceof AiValidationError
    ) {
      logEmailGenerationValidationFailure({
        organizationId: context.organizationId,
        campaignId: context.campaign.id,
        campaignContactId: context.campaignContact.id,
        provider,
        model,
        classified,
        rawTextPreview:
          error instanceof AiValidationError
            ? error.rawTextPreview ?? null
            : null,
        durationMs: Date.now() - started,
        retryCount,
      });
    }

    await recordUsageEvent({
      organizationId: context.organizationId,
      userId: context.userId,
      campaignId: context.campaign.id,
      contactId: context.contact.id,
      category: "EMAIL_GENERATION",
      operation: "EMAIL_DRAFT_CREATED",
      provider,
      model,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      status: "FAILED",
      retryCount,
      durationMs: Date.now() - started,
      metadata: {
        campaignContactId: context.campaignContact.id,
        sequenceNumber,
        kind,
        promptVersion: EMAIL_GENERATION_PROMPT_VERSION,
        ...failureMeta,
      },
    });
    throw error;
  }
}
