import type { AiMessage } from "@/lib/ai/types";
import type { ReplyClassification } from "@prisma/client";
import type { EmailGenerationContext } from "@/lib/email-generation/context";

export const EMAIL_GENERATION_PROMPT_VERSION = "8";
export const ADDITIONAL_GUIDANCE_MAX_CHARS = 200;

const SYSTEM_PROMPT = `You write concise, credible one-to-one outbound emails.

Use the supplied context in this strict priority order:
1. Per-contact regeneration instructions, when supplied. They override campaign guidance and writing defaults.
2. Additional campaign instructions, when supplied. They override writing defaults.
3. The campaign offer and call to action.
4. Persona pain points and desired outcomes.
5. Persona positioning, proof points, and objections.
6. Supported product claims and terminology constraints.
7. Fresh contact role research, when supplied.
8. The first writing sample, when supplied, as the authoritative style reference.

Never invent customer names, metrics, case studies, product capabilities, offer terms, or facts about the recipient. Product claimsNotToMake, terminologyToAvoid, and persona messaging notes are hard constraints regardless of the priority list. Campaign offer terms are authoritative only when they appear in the supplied offer. If optional context is empty, continue without it.
Per-contact regeneration instructions override additional campaign instructions and writing defaults, but they cannot override factual constraints, the selected emailStructure, JSON-only output, the sign-off prohibition, or the em dash prohibition.
Additional campaign instructions may override writing and template defaults, including the default prohibition on bullets, but they cannot override factual constraints, the selected emailStructure, JSON-only output, the sign-off prohibition, or the em dash prohibition.

Writing and structure rules:
- Follow the emailStructure instruction exactly. It defines sentence count, paragraph count, word target, and purpose per paragraph. These constraints override your defaults.
- When a writing sample is supplied, match its sentence length, approximate total length, conversational cadence, paragraph pacing, and closing style. Do not merely borrow its terminology.
- The writing sample's structure overrides any default outbound email or marketing template structure, except that emailStructure overrides the sample's paragraph count.
- Use the sample only as a style reference. Do not copy its recipient, claims, offer, or other facts.
- Do not use bullet points or structured headers unless the additional campaign instructions explicitly request them.
- Put the greeting on its own line, followed by exactly one blank line before the first content paragraph. The greeting does not count as a paragraph or sentence in emailStructure.
- No paragraph may exceed three sentences. Do not write run-on sentences.
- Close the email with exactly one soft question. Do not place additional questions earlier in the email.
- Do not include a sign-off, sender name, sender placeholder, signature, or signature block of any kind. Never write "Best," or "[Your Name]". End the generated body immediately after the closing question or final sentence.
- Never use an em dash character in the subject, body, or reasoning. No exceptions. Use a period, comma, or rewrite the sentence instead.

Return exactly one JSON object matching:
{"subject":"string","body":"string","reasoning":"string"}

Return JSON only. No markdown fences, no preamble, and no text after the JSON object. The body must be ready to send as plain text.`;

export function buildEmailPrompt(
  context: EmailGenerationContext,
  additionalGuidance?: string | null,
): [AiMessage, AiMessage] {
  const firstVoiceSample = context.voiceSamples[0] ?? null;
  const regenerationGuidance = additionalGuidance?.trim() || null;
  const emailStructure =
    context.campaign.emailLength === "SHORT"
      ? {
          emailLength: "SHORT",
          instruction:
            "Put the greeting on its own line, then one blank line, then exactly 1 content paragraph. Write 2-3 content sentences total with no paragraph breaks inside that content paragraph. One hook, one soft close question. Target 40-60 words excluding the greeting.",
        }
      : context.campaign.emailLength === "LONG"
        ? {
            emailLength: "LONG",
            instruction:
              "Put the greeting on its own line, then one blank line, then exactly 3 short content paragraphs separated by one blank line. Content paragraph 1: problem, 2 sentences max. Content paragraph 2: how the product solves it, 2-3 sentences max. Content paragraph 3: offer and close question, 2 sentences max. Target 120-150 words excluding the greeting.",
          }
        : {
            emailLength: "MEDIUM",
            instruction:
              "Put the greeting on its own line, then one blank line, then exactly 2 short content paragraphs separated by one blank line. Content paragraph 1: problem or context, 2 sentences max. Content paragraph 2: offer and close question, 2 sentences max. Target 80-100 words excluding the greeting.",
          };
  const userPayload = {
    regenerationInstructions: regenerationGuidance
      ? `Per-contact regeneration instruction that overrides campaign guidance: ${regenerationGuidance}`
      : null,
    offer: {
      name: context.campaign.offerName,
      description: context.campaign.offerDescription,
      callToAction: context.campaign.offerCta,
      notes: context.campaign.offerNotes,
    },
    additionalInstructions: context.campaign.emailGuidance
      ? `Additional instructions that override defaults: ${context.campaign.emailGuidance}`
      : null,
    emailStructure,
    personaNeeds: {
      persona: context.persona.name,
      painPoints: context.persona.painPoints,
      desiredOutcomes: context.persona.desiredOutcomes,
    },
    personaMessaging: {
      positioning: context.persona.messaging.positioning,
      proofPoints: context.persona.messaging.proofPoints,
      likelyObjections: context.persona.messaging.objections,
      terminology: context.persona.profile.terminology,
      messagingNotes: context.persona.messagingNotes,
      organizationalPressures:
        context.persona.profile.organizationalPressures,
    },
    productMessaging: {
      product: context.product.name,
      description: context.product.description,
      valueProposition: context.product.valueProposition,
      primaryPositioning: context.product.messaging.primaryPositioning,
      coreValueThemes: context.product.messaging.coreValueThemes,
      strongestDifferentiators:
        context.product.messaging.strongestDifferentiators,
      proofPoints: context.product.messaging.proofPoints,
      supportedClaims: context.product.messaging.supportedClaims,
      terminologyToUse: context.product.messaging.terminologyToUse,
      doNotUse: {
        claims: context.product.messaging.claimsNotToMake,
        terms: context.product.messaging.terminologyToAvoid,
      },
    },
    contactContext: {
      recipient: {
        firstName: context.contact.firstName,
        lastName: context.contact.lastName,
        title: context.contact.title,
        company: context.contact.company,
        industry: context.contact.industry,
        location: context.contact.location,
      },
      freshRoleResearch: context.contactResearch
        ? {
            currentTitle: context.contactResearch.currentTitle,
            roleSummary: context.contactResearch.roleSummary,
            responsibilities: context.contactResearch.responsibilities,
            ownershipAreas: context.contactResearch.ownershipAreas,
            professionalSignals:
              context.contactResearch.professionalSignals,
            negativeRoleSignals:
              context.contactResearch.negativeRoleSignals,
            confidence: context.contactResearch.confidence,
          }
        : null,
    },
    voiceStyle: firstVoiceSample
      ? {
          label: firstVoiceSample.label,
          sampleText: firstVoiceSample.sampleText,
        }
      : null,
    audienceFit: {
      icpName: context.icp.name,
      icpDefinition: context.icp.definition ?? context.icp.description,
      personaBuyingRole: context.persona.profile.buyingRole,
      personaDecisionInfluence: context.persona.profile.decisionInfluence,
    },
  };
  const voiceReference = firstVoiceSample
    ? `\n\nWRITING SAMPLE TO MATCH FOR STYLE AND STRUCTURE:\n---\n${firstVoiceSample.sampleText}\n---`
    : "";

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate the first outbound email for this campaign contact.\n\n${JSON.stringify(userPayload, null, 2)}${voiceReference}`,
    },
  ];
}

export function followUpGuidance(sequenceNumber: number): string {
  if (sequenceNumber === 2) {
    return "Use a genuinely different angle or proof point from Email 1. Do not repeat its opener, framing, or ask.";
  }
  if (sequenceNumber === 3) {
    return "Be shorter and more direct than Email 2. Introduce a new concrete reason to respond. Do not repeat a prior opener or ask.";
  }
  return "Write a brief close-out with its own useful reason to exist. Do not make “following up on my last email” the entire content, and do not repeat a prior opener or ask.";
}

export function buildFollowUpEmailPrompt(
  context: EmailGenerationContext,
  sequenceNumber: number,
  additionalGuidance?: string | null,
): AiMessage[] {
  const messages = buildEmailPrompt(context, additionalGuidance);
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

  return [
    {
      role: "system",
      content: `${messages[0].content}

This is Email ${sequenceNumber} in an existing sequence. Every prior email is supplied verbatim. Do not repeat any prior opener, angle, framing, or closing ask. The new email must carry its own reason to exist and should be shorter than the immediately preceding email by default.
For follow-ups, being shorter than the prior email and the position guidance override the campaign word target and default paragraph count. Keep paragraphs short and preserve all factual and claim guards.

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
  ];
}

export function replyStrategy(
  classification: ReplyClassification,
): string {
  switch (classification) {
    case "INTERESTED":
      return "Answer their interest directly, reinforce the most relevant value, and propose one concrete next step.";
    case "OBJECTION":
      return "Acknowledge the specific objection without defensiveness, answer it with supported evidence, and ask one low-pressure question.";
    case "REFERRAL":
      return "Thank the original contact, respond to them directly, and ask for an introduction or permission to contact the referred person. Do not pretend the referred person is already a contact.";
    case "NOT_NOW":
      return "Respect the timing, avoid continuing the pitch, and ask for a specific acceptable window to revisit.";
    case "NOT_INTERESTED":
      return "Respect the decline, stop selling, and close politely without manufacturing urgency or another pitch.";
  }
}

export function buildReplyEmailPrompt(input: {
  context: EmailGenerationContext;
  sourceDraft: {
    sequenceNumber: number;
    subject: string;
    body: string;
  };
  prospectReply: string;
  classification: ReplyClassification;
  additionalGuidance?: string | null;
}): AiMessage[] {
  const messages = buildEmailPrompt(
    input.context,
    input.additionalGuidance,
  );
  return [
    {
      role: "system",
      content: `${messages[0].content}

Draft a direct reply to the prospect. Classification: ${input.classification}.
Required response strategy: ${replyStrategy(input.classification)}
The pasted prospect reply and original sent email are authoritative and must be handled specifically. Do not restart the original outbound pitch.
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
  ];
}
