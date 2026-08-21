/**
 * Structured Product synthesis contract (Zod).
 * Does not score contacts. Does not invent unsupported facts.
 */

import { z } from "zod";

const optionalString = z.string().nullable().optional();

export const productDraftSchema = z.object({
  description: optionalString,
  valueProposition: optionalString,
  problemsSolved: z.array(z.string()).optional().default([]),
  capabilities: z.array(z.string()).optional().default([]),
  differentiators: z.array(z.string()).optional().default([]),
  primaryUseCases: z.array(z.string()).optional().default([]),
  relevantBuyerFunctions: z.array(z.string()).optional().default([]),
  relevantIndustries: z.array(z.string()).optional().default([]),
  businessOutcomes: z.array(z.string()).optional().default([]),
  pricingAovContext: optionalString,
  deploymentContext: optionalString,
  proofPoints: z.array(z.string()).optional().default([]),
  customerEvidence: z.array(z.string()).optional().default([]),
  terminology: z.array(z.string()).optional().default([]),
  unknownFields: z.array(z.string()).optional().default([]),
  evidenceRefs: z
    .array(
      z.object({
        claim: z.string(),
        sourceIds: z.array(z.string()).optional().default([]),
        note: optionalString,
      }),
    )
    .optional()
    .default([]),
});

export const productMessagingDraftSchema = z.object({
  primaryPositioning: optionalString,
  coreValueThemes: z.array(z.string()).optional().default([]),
  strongestDifferentiators: z.array(z.string()).optional().default([]),
  proofPoints: z.array(z.string()).optional().default([]),
  companyLanguage: z.array(z.string()).optional().default([]),
  supportedClaims: z.array(z.string()).optional().default([]),
  claimsNotToMake: z.array(z.string()).optional().default([]),
  terminologyToUse: z.array(z.string()).optional().default([]),
  terminologyToAvoid: z.array(z.string()).optional().default([]),
});

export const suggestedPersonaSchema = z.object({
  suggestionKey: z.string().min(1),
  name: z.string().min(1),
  likelyTitles: z.array(z.string()).optional().default([]),
  department: optionalString,
  seniority: optionalString,
  whyThisPersonaMatters: optionalString,
  evidenceSummary: optionalString,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
});

export const personaDraftSchema = z.object({
  suggestionKey: z.string().min(1),
  name: z.string().min(1),
  definition: optionalString,
  likelyTitles: z.array(z.string()).optional().default([]),
  department: optionalString,
  seniority: optionalString,
  responsibilities: z.array(z.string()).optional().default([]),
  ownershipAreas: z.array(z.string()).optional().default([]),
  painPoints: z.array(z.string()).optional().default([]),
  desiredOutcomesFromYourSolution: z.array(z.string()).optional().default([]),
  positiveRoleSignals: z.array(z.string()).optional().default([]),
  negativeRoleSignals: z.array(z.string()).optional().default([]),
  messagingNotes: optionalString,
  personaPositioning: optionalString,
  relevantProofPoints: z.array(z.string()).optional().default([]),
  likelyObjections: z.array(z.string()).optional().default([]),
  researchGuidance: optionalString,
  criteria: z
    .array(
      z.object({
        name: z.string().min(1),
        criterionType: z.string().min(1),
        description: optionalString,
        operator: z.string().optional().default("EXISTS"),
        targetValue: z.unknown().optional(),
        importance: z
          .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
          .optional()
          .default("MEDIUM"),
        isRequired: z.boolean().optional().default(false),
        isDisqualifier: z.boolean().optional().default(false),
        researchGuidance: optionalString,
      }),
    )
    .optional()
    .default([]),
});

export const productSynthesisResultSchema = z.object({
  productDraft: productDraftSchema,
  productMessagingDraft: productMessagingDraftSchema,
  suggestedPersonas: z.array(suggestedPersonaSchema).max(8),
  personaDrafts: z.array(personaDraftSchema).max(8),
});

export type ProductDraft = z.infer<typeof productDraftSchema>;
export type ProductMessagingDraft = z.infer<typeof productMessagingDraftSchema>;
export type SuggestedPersona = z.infer<typeof suggestedPersonaSchema>;
export type PersonaDraft = z.infer<typeof personaDraftSchema>;
export type ProductSynthesisResult = z.infer<typeof productSynthesisResultSchema>;

export const PRODUCT_SYNTHESIS_PROMPT_VERSION = "1";
