import "server-only";

import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiProvider, AiStructuredResponse } from "@/lib/ai/types";
import { campaignOfferText } from "@/lib/campaign/offer-validation";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  claimValidationSchema,
  type ClaimValidationResult,
  type ClaimValidationViolation,
} from "@/lib/email-generation/claim-validation-contract";

export { claimValidationSchema };
export type { ClaimValidationViolation };

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim();
}

export function deterministicClaimViolations(input: {
  body: string;
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  offerText: string;
  offerConflictsAcknowledged: boolean;
}): ClaimValidationViolation[] {
  const bodyNormalized = normalized(input.body);
  const offerNormalized = normalized(input.offerText);
  const violations: ClaimValidationViolation[] = [];

  for (const claim of input.claimsNotToMake) {
    const claimNormalized = normalized(claim);
    const acknowledgedOfferException =
      input.offerConflictsAcknowledged &&
      offerNormalized.includes(claimNormalized);
    if (
      claim &&
      bodyNormalized.includes(claimNormalized) &&
      !acknowledgedOfferException
    ) {
      violations.push({
        type: "PROHIBITED_CLAIM",
        description: `Generated copy repeats a prohibited claim: ${claim}`,
        matchedGuard: claim,
        bodyExcerpt: claim,
      });
    }
  }
  for (const term of input.terminologyToAvoid) {
    const termNormalized = normalized(term);
    const acknowledgedOfferException =
      input.offerConflictsAcknowledged &&
      offerNormalized.includes(termNormalized);
    if (
      term &&
      bodyNormalized.includes(termNormalized) &&
      !acknowledgedOfferException
    ) {
      violations.push({
        type: "PROHIBITED_TERM",
        description: `Generated copy uses prohibited terminology: ${term}`,
        matchedGuard: term,
        bodyExcerpt: term,
      });
    }
  }

  return violations;
}

export async function validateGeneratedEmailClaims(input: {
  ai: AiProvider;
  context: EmailGenerationContext;
  subject: string;
  body: string;
}): Promise<{
  response: AiStructuredResponse<ClaimValidationResult>;
  violations: ClaimValidationViolation[];
}> {
  const offerText = campaignOfferText(input.context.campaign);
  const offerConflictsAcknowledged =
    Boolean(input.context.campaign.offerConflictAcknowledgedAt) &&
    input.context.campaign.offerConflictAcknowledgedHash ===
      input.context.campaign.offerValidationHash;
  const deterministic = deterministicClaimViolations({
    body: input.body,
    claimsNotToMake: input.context.product.messaging.claimsNotToMake,
    terminologyToAvoid: input.context.product.messaging.terminologyToAvoid,
    offerText,
    offerConflictsAcknowledged,
  });
  const response = await input.ai.generateStructured({
    ...structuredOutputRequest("emailClaimValidation"),
    messages: [
      {
        role: "system",
        content:
          "Validate generated outbound email by meaning, not only exact wording. Evaluate every assertion against the supplied restrictions, product evidence, persona guidance, and campaign offer without relying on preselected categories. Any assertion that changes what the sender is offering must be semantically supported by the campaign offer. If an offer conflict was explicitly acknowledged, the exact meaning of that offer is allowed, but no additional offer assertion may be invented. Return JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            generatedEmail: {
              subject: input.subject,
              body: input.body,
            },
            campaignOffer: offerText || null,
            offerConflictsAcknowledged,
            claimsNotToMake: input.context.product.messaging.claimsNotToMake,
            terminologyToAvoid:
              input.context.product.messaging.terminologyToAvoid,
            supportedClaims: input.context.product.messaging.supportedClaims,
            productEvidence: input.context.product.evidence,
            personaMessagingNotes: input.context.persona.messagingNotes,
            instruction:
              "Flag semantic equivalents of prohibited claims, contradictions with stated product facts, and generated offer assertions that are not supported by the campaign offer.",
          },
          null,
          2,
        ),
      },
    ],
  });
  const violations = [...deterministic, ...response.data.violations].filter(
    (violation, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.type === violation.type &&
          normalized(candidate.description) ===
            normalized(violation.description),
      ) === index,
  );
  if (!response.data.compliant && violations.length === 0) {
    violations.push({
      type: "UNSUPPORTED_FACT",
      description:
        "Semantic validation marked the draft non-compliant without a specific excerpt.",
      matchedGuard: null,
      bodyExcerpt: null,
    });
  }
  return { response, violations };
}
