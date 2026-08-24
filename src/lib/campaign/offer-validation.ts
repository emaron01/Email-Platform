import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { getEmailAiConfig, getEmailAiProvider } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";

export type CampaignOfferFields = {
  offerName: string | null;
  offerDescription: string | null;
  offerCta: string | null;
  offerNotes: string | null;
};

export type OfferConflict = {
  code:
    | "CLAIM_CONFLICT"
    | "TERM_CONFLICT"
    | "EVIDENCE_CONFLICT"
    | "VALIDATION_UNAVAILABLE";
  message: string;
  offerExcerpt: string | null;
  evidenceExcerpt: string | null;
};

export type OfferValidationResult = {
  hash: string;
  conflicts: OfferConflict[];
  semanticValidationCompleted: boolean;
};

export function offerConflictsFromJson(value: unknown): OfferConflict[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const conflicts = (value as { conflicts?: unknown }).conflicts;
  if (!Array.isArray(conflicts)) return [];
  return conflicts.filter((entry): entry is OfferConflict => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const candidate = entry as Partial<OfferConflict>;
    return (
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    );
  });
}

const offerValidationSchema = z.object({
  conflicts: z.array(
    z.object({
      code: z.enum([
        "CLAIM_CONFLICT",
        "TERM_CONFLICT",
        "EVIDENCE_CONFLICT",
      ]),
      message: z.string().trim().min(1).max(500),
      offerExcerpt: z.string().trim().max(500).nullable(),
      evidenceExcerpt: z.string().trim().max(500).nullable(),
    }),
  ),
});

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

export function campaignOfferGuardContext(input: {
  product: {
    description: string | null;
    valueProposition: string | null;
    messagingJson: unknown;
  };
  persona: {
    messagingNotes: string | null;
    personaMessagingJson: unknown;
  };
}): {
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  evidence: string[];
} {
  const productMessaging = objectValue(input.product.messagingJson);
  const personaMessaging = objectValue(input.persona.personaMessagingJson);
  return {
    claimsNotToMake: stringList(productMessaging.claimsNotToMake),
    terminologyToAvoid: stringList(productMessaging.terminologyToAvoid),
    evidence: [
      input.product.description,
      input.product.valueProposition,
      ...stringList(productMessaging.proofPoints),
      ...stringList(productMessaging.supportedClaims),
      ...stringList(personaMessaging.proofPoints),
      input.persona.messagingNotes,
    ].filter((value): value is string => Boolean(value?.trim())),
  };
}

export function campaignOfferText(offer: CampaignOfferFields): string {
  return [
    offer.offerName,
    offer.offerDescription,
    offer.offerCta,
    offer.offerNotes,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .trim();
}

export function campaignOfferValidationHash(input: {
  offer: CampaignOfferFields;
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  evidence: string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        offer: input.offer,
        claimsNotToMake: input.claimsNotToMake,
        terminologyToAvoid: input.terminologyToAvoid,
        evidence: input.evidence,
      }),
    )
    .digest("hex");
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim();
}

function durationTerms(value: string): string[] {
  return Array.from(
    value.matchAll(/\b(\d+)\s*[- ]?\s*(day|week|month|year)s?\b/gi),
    (match) => `${match[1]} ${match[2].toLowerCase()}`,
  );
}

function pricingTerms(value: string): string[] {
  return Array.from(
    value.matchAll(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g),
    (match) => match[0].replace(/\s/g, ""),
  );
}

function audienceCountTerms(value: string): string[] {
  return Array.from(
    value.matchAll(
      /\b\d+\s+(?:users?|seats?|reps?|representatives?|managers?|licenses?)\b/gi,
    ),
    (match) => match[0].toLowerCase(),
  );
}

function conflictKey(conflict: OfferConflict): string {
  return `${conflict.code}:${normalized(conflict.message)}`;
}

export function detectDeterministicOfferConflicts(input: {
  offerText: string;
  claimsNotToMake: string[];
  terminologyToAvoid: string[];
  evidence: string[];
}): OfferConflict[] {
  const conflicts: OfferConflict[] = [];
  const offerNormalized = normalized(input.offerText);
  const evidenceText = input.evidence.join("\n");
  const evidenceNormalized = normalized(evidenceText);

  for (const term of input.terminologyToAvoid) {
    if (term && offerNormalized.includes(normalized(term))) {
      conflicts.push({
        code: "TERM_CONFLICT",
        message: `Your offer uses “${term},” which your product materials say to avoid. Keep anyway?`,
        offerExcerpt: term,
        evidenceExcerpt: term,
      });
    }
  }

  for (const claim of input.claimsNotToMake) {
    if (claim && offerNormalized.includes(normalized(claim))) {
      conflicts.push({
        code: "CLAIM_CONFLICT",
        message: `Your offer includes “${claim},” which your product materials prohibit. Keep anyway?`,
        offerExcerpt: claim,
        evidenceExcerpt: claim,
      });
    }
  }

  const promisesCancellationForAccuracy =
    /\bif\b[\s\S]{0,100}\bforecast accuracy\b[\s\S]{0,80}\b(?:does not|doesnt|fails? to|not)\b[\s\S]{0,40}\bimprov\w*\b[\s\S]{0,80}\bcancel\b/i.test(
      input.offerText,
    );
  const accuracyGuaranteeProhibited = input.claimsNotToMake.some((claim) =>
    /guarantee\w*[\s\S]*forecast accuracy|forecast accuracy[\s\S]*guarantee/i.test(
      claim,
    ),
  );
  if (promisesCancellationForAccuracy && accuracyGuaranteeProhibited) {
    conflicts.push({
      code: "CLAIM_CONFLICT",
      message:
        "Your offer promises cancellation if forecast accuracy does not improve. Your product materials prohibit guaranteed forecast-accuracy claims. Keep anyway?",
      offerExcerpt: input.offerText,
      evidenceExcerpt: input.claimsNotToMake.find((claim) =>
        /forecast accuracy/i.test(claim),
      ) ?? null,
    });
  }

  const evidenceDurations = new Set(
    durationTerms(evidenceText).map(normalized),
  );
  for (const duration of durationTerms(input.offerText)) {
    if (
      evidenceDurations.size > 0 &&
      !evidenceDurations.has(normalized(duration))
    ) {
      conflicts.push({
        code: "EVIDENCE_CONFLICT",
        message: `Your offer says “${duration},” but product evidence supports ${Array.from(evidenceDurations).join(", ")}. Keep anyway?`,
        offerExcerpt: duration,
        evidenceExcerpt: durationTerms(evidenceText).join(", "),
      });
    }
  }

  for (const price of pricingTerms(input.offerText)) {
    if (!evidenceNormalized.includes(normalized(price))) {
      conflicts.push({
        code: "EVIDENCE_CONFLICT",
        message: `Your offer includes pricing of ${price}, which is not supported by the current product evidence. Keep anyway?`,
        offerExcerpt: price,
        evidenceExcerpt: null,
      });
    }
  }

  const evidenceCounts = new Set(
    audienceCountTerms(evidenceText).map(normalized),
  );
  for (const count of audienceCountTerms(input.offerText)) {
    if (evidenceCounts.size > 0 && !evidenceCounts.has(normalized(count))) {
      conflicts.push({
        code: "EVIDENCE_CONFLICT",
        message: `Your offer says “${count},” while current product evidence describes ${Array.from(evidenceCounts).join(", ")}. Keep anyway?`,
        offerExcerpt: count,
        evidenceExcerpt: audienceCountTerms(evidenceText).join(", "),
      });
    }
  }

  return Array.from(
    new Map(conflicts.map((conflict) => [conflictKey(conflict), conflict])).values(),
  );
}

export async function validateCampaignOffer(input: {
  organizationId: string;
  userId: string;
  productId: string;
  personaId: string;
  offer: CampaignOfferFields;
}): Promise<OfferValidationResult> {
  const [product, persona] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, organizationId: input.organizationId },
      select: {
        description: true,
        valueProposition: true,
        messagingJson: true,
      },
    }),
    prisma.persona.findFirst({
      where: { id: input.personaId, organizationId: input.organizationId },
      select: {
        messagingNotes: true,
        personaMessagingJson: true,
      },
    }),
  ]);
  if (!product || !persona) {
    throw new TenantError(
      "Product and persona must belong to the active organization.",
    );
  }

  const { claimsNotToMake, terminologyToAvoid, evidence } =
    campaignOfferGuardContext({ product, persona });
  const offerText = campaignOfferText(input.offer);
  const hash = campaignOfferValidationHash({
    offer: input.offer,
    claimsNotToMake,
    terminologyToAvoid,
    evidence,
  });
  if (!offerText) {
    return { hash, conflicts: [], semanticValidationCompleted: true };
  }

  const deterministic = detectDeterministicOfferConflicts({
    offerText,
    claimsNotToMake,
    terminologyToAvoid,
    evidence,
  });
  const started = Date.now();

  try {
    getEmailAiConfig();
    const ai = getEmailAiProvider();
    const response = await ai.generateStructured({
      messages: [
        {
          role: "system",
          content:
            "You validate a campaign offer against product claim restrictions and evidence. Identify semantic conflicts, including paraphrases and conditional guarantees. A newer offer may legitimately differ, so report warnings rather than rewriting or rejecting it. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              offer: offerText,
              claimsNotToMake,
              terminologyToAvoid,
              productEvidence: evidence,
              exampleConflict:
                "If forecast accuracy does not improve, cancel semantically conflicts with a prohibition on guaranteed forecast-accuracy claims.",
            },
            null,
            2,
          ),
        },
      ],
      schema: offerValidationSchema,
      schemaName: "campaign_offer_validation",
    });
    const conflicts = Array.from(
      new Map(
        [...deterministic, ...response.data.conflicts].map((conflict) => [
          conflictKey(conflict),
          conflict,
        ]),
      ).values(),
    );

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "EMAIL_GENERATION",
      operation: "CAMPAIGN_OFFER_VALIDATED",
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      metadata: { conflictCount: conflicts.length },
    });
    return { hash, conflicts, semanticValidationCompleted: true };
  } catch (error) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "EMAIL_GENERATION",
      operation: "CAMPAIGN_OFFER_VALIDATED",
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        deterministicConflictCount: deterministic.length,
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
      },
    });
    return {
      hash,
      conflicts: [
        ...deterministic,
        {
          code: "VALIDATION_UNAVAILABLE",
          message:
            "Semantic offer validation was unavailable, so paraphrased claim conflicts may not have been detected. Keep anyway?",
          offerExcerpt: null,
          evidenceExcerpt: null,
        },
      ],
      semanticValidationCompleted: false,
    };
  }
}
