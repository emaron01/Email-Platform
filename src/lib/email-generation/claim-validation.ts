import "server-only";

import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiProvider, AiStructuredResponse } from "@/lib/ai/types";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  buildRepClaimSources,
  deterministicClaimViolations,
  keepModelOriginatedViolations,
  normalizedClaimText,
} from "@/lib/email-generation/claim-origin";
import {
  claimValidationSchema,
  type ClaimValidationResult,
  type ClaimValidationViolation,
} from "@/lib/email-generation/claim-validation-contract";

export { claimValidationSchema, deterministicClaimViolations };
export type { ClaimValidationViolation };

export async function validateGeneratedEmailClaims(input: {
  ai: AiProvider;
  context: EmailGenerationContext;
  subject: string;
  body: string;
  regenerationGuidance?: string | null;
  /** Text the rep introduced relative to generatedBody (manual edit path). */
  repEditText?: string | null;
}): Promise<{
  response: AiStructuredResponse<ClaimValidationResult>;
  violations: ClaimValidationViolation[];
}> {
  const repSources = buildRepClaimSources({
    offer: input.context.campaign,
    emailGuidance: input.context.campaign.emailGuidance,
    regenerationGuidance: input.regenerationGuidance,
    repEditText: input.repEditText,
  });
  const evidenceTexts = [
    ...input.context.product.evidence,
    ...input.context.product.messaging.supportedClaims,
    input.context.product.description,
    input.context.product.valueProposition,
  ].filter((value): value is string => Boolean(value?.trim()));

  const deterministic = deterministicClaimViolations({
    body: input.body,
    claimsNotToMake: input.context.product.messaging.claimsNotToMake,
    terminologyToAvoid: input.context.product.messaging.terminologyToAvoid,
    repSources,
  });
  const response = await input.ai.generateStructured({
    ...structuredOutputRequest("emailClaimValidation"),
    messages: [
      {
        role: "system",
        content:
          "You check whether the MODEL invented unsupported assertions. The rep is trusted: anything supported by the campaign offer, email guidance, regeneration guidance, or rep edit text must NOT be flagged. Anything supported by product evidence or supportedClaims must NOT be flagged. Only flag MODEL_ORIGINATED inventions — assertions in the generated email that appear in neither rep sources nor evidence. Return JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            generatedEmail: {
              subject: input.subject,
              body: input.body,
            },
            repSources: {
              campaignOffer: repSources.offerText || null,
              emailGuidance: repSources.emailGuidance,
              regenerationGuidance: repSources.regenerationGuidance,
              repEditText: repSources.repEditText ?? null,
            },
            claimsNotToMake: input.context.product.messaging.claimsNotToMake,
            terminologyToAvoid:
              input.context.product.messaging.terminologyToAvoid,
            supportedClaims: input.context.product.messaging.supportedClaims,
            productEvidence: input.context.product.evidence,
            personaMessagingNotes: input.context.persona.messagingNotes,
            instruction:
              "Flag only model inventions. If a claim is present in repSources (including emailGuidance such as website-visitor knowledge), it is rep-asserted — never flag it. If evidence supports it, never flag it.",
          },
          null,
          2,
        ),
      },
    ],
  });
  const merged = [...deterministic, ...response.data.violations].filter(
    (violation, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.type === violation.type &&
          normalizedClaimText(candidate.description) ===
            normalizedClaimText(violation.description),
      ) === index,
  );
  if (!response.data.compliant && merged.length === 0) {
    merged.push({
      type: "UNSUPPORTED_FACT",
      description:
        "Semantic validation marked the draft non-compliant without a specific excerpt.",
      matchedGuard: null,
      bodyExcerpt: null,
    });
  }
  const violations = keepModelOriginatedViolations(
    merged,
    repSources,
    evidenceTexts,
  );
  return { response, violations };
}
