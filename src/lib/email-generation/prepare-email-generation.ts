import "server-only";

import type { AiMessage } from "@/lib/ai/types";
import type { ReplyClassification } from "@prisma/client";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import type { RequiredMotionSpecific } from "@/lib/email-generation/motion-specifics";
import {
  bodyReferencesRequiredSpecific,
  selectRequiredMotionSpecifics,
} from "@/lib/email-generation/motion-specifics";
import {
  contactResearchForPrompt,
  resolvePersonalizationForGeneration,
  type PersonalizationDecision,
} from "@/lib/email-generation/personalization";
import {
  buildEmailPrompt,
  followUpGuidance,
  replyStrategy,
} from "@/lib/email-generation/prompt";
import {
  selectRelevantCompanyFacts,
  type FactSelectionResult,
} from "@/lib/email-generation/semantic-fact-selector";

export type PreparedEmailGeneration = {
  messages: AiMessage[];
  requiredMotionSpecifics: RequiredMotionSpecific[];
  personalization: PersonalizationDecision;
  factSelection: FactSelectionResult;
};

export function selectUnusedFollowUpSpecifics(
  specifics: RequiredMotionSpecific[],
  priorEmails: Array<{ body: string | null }>,
): RequiredMotionSpecific[] {
  const unused = specifics.filter(
    (specific) =>
      !priorEmails.some((email) =>
        email.body
          ? bodyReferencesRequiredSpecific(email.body, [specific])
          : false,
      ),
  );
  return unused.length > 0 ? unused : specifics;
}

/**
 * Semantic selection first. When the semantic path is skipped (config missing,
 * selector failure, no research / no candidates), fall back to the prior
 * lexical selector so company-specific emails are not wiped to THIN.
 * When semantic runs and returns none, keep THIN — that is an intentional gate.
 * Fact selection must never break email generation.
 */
export async function prepareEmailGenerationMessages(
  context: EmailGenerationContext,
  additionalGuidance?: string | null,
): Promise<{
  messages: [AiMessage, AiMessage];
  requiredMotionSpecifics: RequiredMotionSpecific[];
  personalization: PersonalizationDecision;
  factSelection: FactSelectionResult;
}> {
  let factSelection: FactSelectionResult;
  try {
    factSelection = await selectRelevantCompanyFacts({
      organizationId: context.organizationId,
      companyId: context.contact.companyId ?? "none",
      productId: context.product.id,
      personaId: context.persona.id,
      contactTitle: context.contact.title,
      product: {
        problemsSolved: context.product.problemsSolved,
      },
      persona: {
        name: context.persona.name,
        painPoints: context.persona.painPoints,
        desiredOutcomes: context.persona.desiredOutcomes,
      },
      research: context.companyResearch,
      researchUpdatedAt: context.companyResearchUpdatedAt,
    });
  } catch (error) {
    // Belt-and-suspenders: selector is supposed to degrade internally; if it
    // still throws, generation continues with lexical fallback below.
    console.warn("[email-fact-selection]", {
      message: "fact selection threw; continuing with lexical fallback",
      organizationId: context.organizationId,
      companyId: context.contact.companyId ?? "none",
      error: error instanceof Error ? error.message : String(error),
    });
    factSelection = {
      specifics: [],
      noneRelevant: true,
      usage: {
        provider: "skipped",
        model: "skipped",
        inputTokens: 0,
        outputTokens: 0,
        cached: false,
        durationMs: 0,
        skipReason: "selector failed",
      },
      cacheKey: null,
      skipReason: "selector failed",
      // Force lexical path below even if research had no prior candidate count.
      candidateCount: 1,
    };
  }

  let requiredMotionSpecifics = factSelection.specifics;
  // Any skip with candidates (config missing or selector failure) → lexical.
  // Intentional semantic "none" has skipReason null and must stay THIN.
  if (factSelection.skipReason && factSelection.candidateCount > 0) {
    requiredMotionSpecifics = selectRequiredMotionSpecifics({
      research: context.companyResearch,
      problemSpace: {
        problemsSolved: context.product.problemsSolved,
        painPoints: context.persona.painPoints,
      },
      contactTitle: context.contact.title,
    });
    console.info("[email-fact-selection]", {
      message: `lexical fallback after semantic skip (${factSelection.skipReason}): ${requiredMotionSpecifics.length} selected`,
      organizationId: context.organizationId,
      companyId: context.contact.companyId ?? "none",
      draftId: null,
      candidateCount: factSelection.candidateCount,
      selectedCount: requiredMotionSpecifics.length,
    });
  }

  const personalization = resolvePersonalizationForGeneration({
    companyResearch: context.companyResearch,
    contactResearch: contactResearchForPrompt(context.contactResearch),
    hasRelevantCompanyFacts: requiredMotionSpecifics.length > 0,
  });

  const messages = buildEmailPrompt(
    context,
    {
      personalization,
      requiredMotionSpecifics,
    },
    additionalGuidance ?? null,
  );

  return {
    messages,
    requiredMotionSpecifics,
    personalization,
    factSelection: {
      ...factSelection,
      specifics: requiredMotionSpecifics,
      noneRelevant: requiredMotionSpecifics.length === 0,
    },
  };
}

export async function buildFollowUpEmailPrompt(
  context: EmailGenerationContext,
  sequenceNumber: number,
  additionalGuidance?: string | null,
): Promise<PreparedEmailGeneration> {
  const prepared = await prepareEmailGenerationMessages(
    context,
    additionalGuidance,
  );
  const priorEmails = context.sequence
    .filter(
      (draft) =>
        draft.sequenceNumber < sequenceNumber &&
        draft.status === "SENT" &&
        draft.subject &&
        draft.body,
    )
    .map((draft) => ({
      sequenceNumber: draft.sequenceNumber,
      subject: draft.subject,
      body: draft.body,
      sentAt: draft.sentAt?.toISOString() ?? null,
    }));
  const previous = priorEmails.at(-1);
  const requiredMotionSpecifics = selectUnusedFollowUpSpecifics(
    prepared.requiredMotionSpecifics,
    priorEmails,
  );
  const personalization = resolvePersonalizationForGeneration({
    companyResearch: context.companyResearch,
    contactResearch: contactResearchForPrompt(context.contactResearch),
    hasRelevantCompanyFacts: requiredMotionSpecifics.length > 0,
  });
  const messages =
    requiredMotionSpecifics === prepared.requiredMotionSpecifics
      ? prepared.messages
      : buildEmailPrompt(
          context,
          { personalization, requiredMotionSpecifics },
          additionalGuidance ?? null,
        );

  return {
    messages: [
      {
        role: "system",
        content: `${messages[0].content}

This is Email ${sequenceNumber} in an existing sequence. Every prior email is supplied verbatim. Do not repeat any prior opener, angle, framing, or closing ask. The new email must carry its own reason to exist.
The selected emailStructure remains authoritative for content-block count, sentence count, and word range. Follow-up position guidance changes the angle and emphasis, never the rep's selected length. Keep paragraphs short and preserve all factual and claim guards.
Choose a different supported opening approach from the prior emails. Use a different selected company fact when one remains unused. Pull a different supported product feature, positioning theme, proof point, or offer emphasis. Do not paraphrase the same problem → solution → ask sequence.

Position guidance: ${followUpGuidance(sequenceNumber)}`,
      },
      {
        role: "user",
        content: `${messages[1].content}

SEQUENCE CONTEXT:
${JSON.stringify(
  {
    currentPosition: sequenceNumber,
    positionGuidance: followUpGuidance(sequenceNumber),
    priorEmailsVerbatim: priorEmails,
    previousEmailWordCount: previous?.body
      ? previous.body.trim().split(/\s+/).length
      : null,
  },
  null,
  2,
)}`,
      },
    ],
    requiredMotionSpecifics,
    personalization,
    factSelection: {
      ...prepared.factSelection,
      specifics: requiredMotionSpecifics,
      noneRelevant: requiredMotionSpecifics.length === 0,
    },
  };
}

export async function buildReplyEmailPrompt(input: {
  context: EmailGenerationContext;
  sourceDraft: {
    sequenceNumber: number;
    subject: string;
    body: string;
  };
  prospectReply: string;
  classification: ReplyClassification;
  additionalGuidance?: string | null;
}): Promise<PreparedEmailGeneration> {
  const prepared = await prepareEmailGenerationMessages(
    input.context,
    input.additionalGuidance,
  );
  const messages = prepared.messages;
  return {
    messages: [
      {
        role: "system",
        content: `${messages[0].content}

Draft a direct reply to the prospect. Classification: ${input.classification}.
Required response strategy: ${replyStrategy(input.classification)}
The pasted prospect reply and original sent email are authoritative and must be handled specifically. Do not restart the original outbound pitch.
Reply emails must not include a sign-off, sender name, signature, or signature block. End immediately after the closing question or final sentence.
The classification strategy overrides outbound email length, offer, and closing-question defaults when they conflict. Keep every factual and claim guard.`,
      },
      {
        role: "user",
        content: `${messages[1].content}

REPLY CONTEXT:
${JSON.stringify(
  {
    classification: input.classification,
    responseStrategy: replyStrategy(input.classification),
    originalSentEmail: input.sourceDraft,
    prospectReplyVerbatim: input.prospectReply,
    referralInstruction:
      input.classification === "REFERRAL"
        ? "Reply to the original contact and flag that a new contact may need to be added. Do not create one."
        : null,
  },
  null,
  2,
)}`,
      },
    ],
    requiredMotionSpecifics: prepared.requiredMotionSpecifics,
    personalization: prepared.personalization,
    factSelection: prepared.factSelection,
  };
}
