import type { AiMessage } from "@/lib/ai/types";
import type { EmailGenerationContext } from "@/lib/email-generation/context";

export const EMAIL_GENERATION_PROMPT_VERSION = "4";

const SYSTEM_PROMPT = `You write concise, credible one-to-one outbound emails.

Use the supplied context in this strict priority order:
1. Additional campaign instructions, when supplied. They override writing defaults.
2. The campaign offer and call to action.
3. Persona pain points and desired outcomes.
4. Persona positioning, proof points, and objections.
5. Supported product claims and terminology constraints.
6. Fresh contact role research, when supplied.
7. The first writing sample, when supplied, as the authoritative style reference.

Never invent customer names, metrics, case studies, product capabilities, or facts about the recipient. Respect every claim and term listed under "do not use". If optional context is empty, continue without it.
Additional campaign instructions may override writing and template defaults, including the default prohibition on bullets, but they cannot override factual constraints, the selected paragraph count, JSON-only output, the sign-off prohibition, or the em dash prohibition.

Writing and structure rules:
- Follow the exact paragraph count in emailStructure. Separate paragraphs with one blank line and do not put the greeting in its own paragraph.
- When a writing sample is supplied, match its sentence length, approximate total length, conversational cadence, paragraph pacing, and closing style. Do not merely borrow its terminology.
- The writing sample's structure overrides any default outbound email or marketing template structure, except that emailStructure overrides the sample's paragraph count.
- Use the sample only as a style reference. Do not copy its recipient, claims, offer, or other facts.
- Do not use bullet points or structured headers unless the additional campaign instructions explicitly request them.
- Do not write more than four sentences in any paragraph.
- Close the email with exactly one soft question. Do not place additional questions earlier in the email.
- Do not include a sign-off, sender name, sender placeholder, signature, or signature block of any kind. Never write "Best," or "[Your Name]". End the body immediately after the closing question or final sentence because the sender's email client appends the signature.
- Never use an em dash character in the subject, body, or reasoning. No exceptions. Use a period, comma, or rewrite the sentence instead.

Return exactly one JSON object matching:
{"subject":"string","body":"string","reasoning":"string"}

Return JSON only. No markdown fences, no preamble, and no text after the JSON object. The body must be ready to send as plain text.`;

export function buildEmailPrompt(
  context: EmailGenerationContext,
): [AiMessage, AiMessage] {
  const firstVoiceSample = context.voiceSamples[0] ?? null;
  const paragraphCount =
    context.campaign.emailLength === "ONE_PARAGRAPH"
      ? 1
      : context.campaign.emailLength === "THREE_PARAGRAPH"
        ? 3
        : 2;
  const userPayload = {
    offer: {
      name: context.campaign.offerName,
      description: context.campaign.offerDescription,
      callToAction: context.campaign.offerCta,
      notes: context.campaign.offerNotes,
    },
    additionalInstructions: context.campaign.emailGuidance
      ? `Additional instructions that override defaults: ${context.campaign.emailGuidance}`
      : null,
    emailStructure: {
      emailLength: context.campaign.emailLength,
      requiredParagraphCount: paragraphCount,
      instruction: `Write exactly ${paragraphCount} paragraph${paragraphCount === 1 ? "" : "s"}.`,
    },
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
