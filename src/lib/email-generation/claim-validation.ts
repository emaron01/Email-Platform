import "server-only";

import { z } from "zod";
import type { AiProvider, AiStructuredResponse } from "@/lib/ai/types";
import { campaignOfferText } from "@/lib/campaign/offer-validation";
import type { EmailGenerationContext } from "@/lib/email-generation/context";

const claimValidationSchema = z.object({
  compliant: z.boolean(),
  violations: z.array(
    z.object({
      type: z.enum([
        "PROHIBITED_CLAIM",
        "PROHIBITED_TERM",
        "INVENTED_OFFER_TERM",
        "UNSUPPORTED_FACT",
      ]),
      description: z.string().trim().min(1).max(500),
      matchedGuard: z.string().trim().max(500).nullable(),
      bodyExcerpt: z.string().trim().max(500).nullable(),
    }),
  ),
});

export type ClaimValidationViolation = z.infer<
  typeof claimValidationSchema
>["violations"][number];

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim();
}

function offerSensitiveTerms(value: string): string[] {
  const patterns = [
    /\b\d+\s*[- ]?\s*(?:day|week|month|year)s?\b/gi,
    /\$\s?\d[\d,]*(?:\.\d{1,2})?/g,
    /\b\d+\s+(?:users?|seats?|reps?|representatives?|managers?|licenses?)\b/gi,
    /\bfree\s+(?:trial|pilot|analysis)\b/gi,
    /\b(?:trial|pilot|pricing|discount|cancel(?:lation)?|no obligation)\b/gi,
  ];
  return Array.from(
    new Set(patterns.flatMap((pattern) => Array.from(value.matchAll(pattern), (match) => match[0]))),
  );
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

  if (
    !input.offerConflictsAcknowledged &&
    /\bif\b[\s\S]{0,100}\bforecast accuracy\b[\s\S]{0,80}\b(?:does not|doesnt|fails? to|not)\b[\s\S]{0,40}\bimprov\w*\b[\s\S]{0,80}\bcancel\b/i.test(
      input.body,
    )
  ) {
    violations.push({
      type: "PROHIBITED_CLAIM",
      description:
        "Generated copy promises cancellation if forecast accuracy does not improve.",
      matchedGuard:
        input.claimsNotToMake.find((claim) => /forecast accuracy/i.test(claim)) ??
        "Guaranteed forecast-accuracy claims",
      bodyExcerpt: input.body,
    });
  }

  for (const term of offerSensitiveTerms(input.body)) {
    if (!offerNormalized.includes(normalized(term))) {
      violations.push({
        type: "INVENTED_OFFER_TERM",
        description: `Generated copy introduced offer term “${term}” that is absent from the campaign offer.`,
        matchedGuard: input.offerText || "No campaign offer is set.",
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
  response: AiStructuredResponse<z.infer<typeof claimValidationSchema>>;
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
    messages: [
      {
        role: "system",
        content:
          "You are a strict semantic compliance validator for outbound email. Detect paraphrases and implied guarantees, not only exact string matches. Also detect trial, pilot, duration, pricing, cancellation, or audience-size terms that are not present in the campaign offer. If an offer conflict was explicitly acknowledged, the exact campaign offer terms are allowed, but no additional terms may be invented. Return JSON only.",
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
            claimsNotToMake:
              input.context.product.messaging.claimsNotToMake,
            terminologyToAvoid:
              input.context.product.messaging.terminologyToAvoid,
            supportedClaims: input.context.product.messaging.supportedClaims,
            personaMessagingNotes: input.context.persona.messagingNotes,
            instruction:
              "Flag semantically equivalent prohibited claims. Example: “If forecast accuracy does not improve, cancel” conflicts with a prohibition on guaranteed forecast-accuracy claims unless that exact offer conflict was explicitly acknowledged.",
          },
          null,
          2,
        ),
      },
    ],
    schema: claimValidationSchema,
    schemaName: "email_claim_validation",
  });
  const violations = [
    ...deterministic,
    ...response.data.violations,
  ].filter(
    (violation, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.type === violation.type &&
          normalized(candidate.description) === normalized(violation.description),
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
