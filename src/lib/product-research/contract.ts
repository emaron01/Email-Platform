/**
 * Structured Product synthesis contract (Zod).
 *
 * AI validates against productAiResponseSchema (canonical personas[], no suggestionKey).
 * Application derives SuggestedPersona + PersonaDraft with stable suggestionKeys.
 */

import { z } from "zod";

const optionalString = z.string().nullable().optional();

const stringList = z.array(z.string()).optional().default([]);

const evidenceRefSchema = z.object({
  claim: z.string(),
  sourceIds: z.array(z.string()).optional().default([]),
  note: optionalString,
});

/** Non-empty trimmed persona name — required semantic field. */
export const requiredPersonaNameSchema = z
  .string()
  .trim()
  .min(1, "Persona name is required");

export const productDraftSchema = z.object({
  description: optionalString,
  valueProposition: optionalString,
  problemsSolved: stringList,
  capabilities: stringList,
  differentiators: stringList,
  primaryUseCases: stringList,
  relevantBuyerFunctions: stringList,
  relevantIndustries: stringList,
  businessOutcomes: stringList,
  pricingAovContext: optionalString,
  deploymentContext: optionalString,
  proofPoints: stringList,
  customerEvidence: stringList,
  terminology: stringList,
  unknownFields: stringList,
  evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
});

export const productMessagingDraftSchema = z.object({
  primaryPositioning: optionalString,
  coreValueThemes: stringList,
  strongestDifferentiators: stringList,
  proofPoints: stringList,
  companyLanguage: stringList,
  supportedClaims: stringList,
  claimsNotToMake: stringList,
  terminologyToUse: stringList,
  terminologyToAvoid: stringList,
});

const criterionDraftSchema = z.object({
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
});

/**
 * Canonical persona object returned by PRODUCT_AI.
 * No suggestionKey — application identity is assigned after validation.
 */
export const canonicalPersonaSchema = z
  .object({
    name: requiredPersonaNameSchema,
    likelyTitles: stringList,
    /** Buyer function / org function (preferred). */
    function: optionalString,
    /** Alias accepted for function. */
    department: optionalString,
    seniority: optionalString,
    whyThisPersonaMatters: optionalString,
    evidenceSummary: optionalString,
    responsibilities: stringList,
    ownershipAreas: stringList,
    painPoints: stringList,
    desiredOutcomesFromSolution: stringList,
    /** Alias for desiredOutcomesFromSolution. */
    desiredOutcomesFromYourSolution: stringList,
    positiveSignals: stringList,
    /** Alias for positiveSignals. */
    positiveRoleSignals: stringList,
    negativeSignals: stringList,
    /** Alias for negativeSignals. */
    negativeRoleSignals: stringList,
    messagingNotes: optionalString,
    personaPositioning: optionalString,
    relevantProofPoints: stringList,
    likelyObjections: stringList,
    researchGuidance: optionalString,
    definition: optionalString,
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
    evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
    criteria: z.array(criterionDraftSchema).optional().default([]),
  })
  .transform((p) => ({
    name: p.name,
    likelyTitles: p.likelyTitles,
    function: p.function ?? p.department ?? null,
    department: p.department ?? p.function ?? null,
    seniority: p.seniority ?? null,
    whyThisPersonaMatters: p.whyThisPersonaMatters ?? null,
    evidenceSummary: p.evidenceSummary ?? null,
    responsibilities: p.responsibilities,
    ownershipAreas: p.ownershipAreas,
    painPoints: p.painPoints,
    desiredOutcomesFromSolution:
      p.desiredOutcomesFromSolution.length > 0
        ? p.desiredOutcomesFromSolution
        : p.desiredOutcomesFromYourSolution,
    positiveSignals:
      p.positiveSignals.length > 0 ? p.positiveSignals : p.positiveRoleSignals,
    negativeSignals:
      p.negativeSignals.length > 0 ? p.negativeSignals : p.negativeRoleSignals,
    messagingNotes: p.messagingNotes ?? null,
    personaPositioning: p.personaPositioning ?? null,
    relevantProofPoints: p.relevantProofPoints,
    likelyObjections: p.likelyObjections,
    researchGuidance: p.researchGuidance ?? null,
    definition: p.definition ?? null,
    confidence: p.confidence,
    evidenceRefs: p.evidenceRefs,
    criteria: p.criteria,
  }));

/** Schema passed to PRODUCT_AI generateStructured (no suggestionKey). */
export const productAiResponseSchema = z.object({
  productDraft: productDraftSchema,
  productMessagingDraft: productMessagingDraftSchema,
  personas: z.array(canonicalPersonaSchema).max(8),
});

/** Persisted / UI suggestion card (app-owned suggestionKey). */
export const suggestedPersonaSchema = z.object({
  suggestionKey: z.string().min(1),
  name: z.string().min(1),
  likelyTitles: stringList,
  department: optionalString,
  seniority: optionalString,
  whyThisPersonaMatters: optionalString,
  evidenceSummary: optionalString,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
});

/** Persisted / UI persona draft (same suggestionKey as card). */
export const personaDraftSchema = z.object({
  suggestionKey: z.string().min(1),
  name: z.string().min(1),
  definition: optionalString,
  likelyTitles: stringList,
  department: optionalString,
  seniority: optionalString,
  responsibilities: stringList,
  ownershipAreas: stringList,
  painPoints: stringList,
  desiredOutcomesFromYourSolution: stringList,
  positiveRoleSignals: stringList,
  negativeRoleSignals: stringList,
  messagingNotes: optionalString,
  personaPositioning: optionalString,
  relevantProofPoints: stringList,
  likelyObjections: stringList,
  researchGuidance: optionalString,
  criteria: z.array(criterionDraftSchema).optional().default([]),
});

/** App-side synthesis result after key assignment (not the raw AI schema). */
export const productSynthesisResultSchema = z.object({
  productDraft: productDraftSchema,
  productMessagingDraft: productMessagingDraftSchema,
  suggestedPersonas: z.array(suggestedPersonaSchema).max(8),
  personaDrafts: z.array(personaDraftSchema).max(8),
});

export type ProductDraft = z.infer<typeof productDraftSchema>;
export type ProductMessagingDraft = z.infer<typeof productMessagingDraftSchema>;
export type CanonicalPersona = z.infer<typeof canonicalPersonaSchema>;
export type ProductAiResponse = z.infer<typeof productAiResponseSchema>;
export type SuggestedPersona = z.infer<typeof suggestedPersonaSchema>;
export type PersonaDraft = z.infer<typeof personaDraftSchema>;
export type ProductSynthesisResult = z.infer<typeof productSynthesisResultSchema>;

export const PRODUCT_SYNTHESIS_PROMPT_VERSION = "2";
