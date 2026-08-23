import type { AiMessage } from "@/lib/ai/types";
import type { EmailGenerationContext } from "@/lib/email-generation/context";

export const EMAIL_GENERATION_PROMPT_VERSION = "1";

const SYSTEM_PROMPT = `You write concise, credible one-to-one outbound emails.

Use the supplied context in this strict priority order:
1. The campaign offer and call to action.
2. Persona pain points and desired outcomes.
3. Persona positioning, proof points, and objections.
4. Supported product claims and terminology constraints.
5. Fresh contact role research, when supplied.
6. The first writing sample, when supplied, as style guidance only.

Never invent customer names, metrics, case studies, product capabilities, or facts about the recipient. Respect every claim and term listed under "do not use". If optional context is empty, continue without it.

Return exactly one JSON object matching:
{"subject":"string","body":"string","reasoning":"string"}

Return JSON only. No markdown fences, no preamble, and no text after the JSON object. The body must be ready to send as plain text.`;

export function buildEmailPrompt(
  context: EmailGenerationContext,
): [AiMessage, AiMessage] {
  const firstVoiceSample = context.voiceSamples[0] ?? null;
  const userPayload = {
    offer: {
      name: context.campaign.offerName,
      description: context.campaign.offerDescription,
      callToAction: context.campaign.offerCta,
      notes: context.campaign.offerNotes,
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

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate the first outbound email for this campaign contact.\n\n${JSON.stringify(userPayload, null, 2)}`,
    },
  ];
}
