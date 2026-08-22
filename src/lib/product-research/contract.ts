/**
 * Product synthesis contract (v3) — Product draft + lightweight SuggestedBuyerRoles.
 * Full Persona drafts are produced later by PERSONA_AI (one role at a time).
 */

import { z } from "zod";

const optionalString = z.string().nullable().optional();
const stringList = z.array(z.string()).optional().default([]);

const evidenceRefSchema = z.object({
  claim: z.string(),
  sourceIds: z.array(z.string()).optional().default([]),
  note: optionalString,
});

export const requiredRoleNameSchema = z
  .string()
  .trim()
  .min(1, "Buyer role name is required");

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

/** Lightweight AI buyer-role suggestion (not an authoritative Persona). */
export const suggestedBuyerRoleAiSchema = z.object({
  name: requiredRoleNameSchema,
  likelyTitles: stringList,
  departmentFunction: optionalString,
  whyThisRoleMatters: optionalString,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
});

/** Schema passed to PRODUCT_AI (no suggestionKey, no persona drafts). */
export const productAiResponseSchema = z.object({
  productDraft: productDraftSchema,
  productMessagingDraft: productMessagingDraftSchema,
  suggestedBuyerRoles: z.array(suggestedBuyerRoleAiSchema).max(8),
});

/** App-persisted SuggestedBuyerRole with application-owned key. */
export const suggestedBuyerRoleSchema = z.object({
  suggestionKey: z.string().min(1),
  name: z.string().min(1),
  likelyTitles: stringList,
  departmentFunction: optionalString,
  whyThisRoleMatters: optionalString,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  evidenceRefs: z.array(evidenceRefSchema).optional().default([]),
});

export const productSynthesisResultSchema = z.object({
  productDraft: productDraftSchema,
  productMessagingDraft: productMessagingDraftSchema,
  suggestedBuyerRoles: z.array(suggestedBuyerRoleSchema).max(8),
});

export type ProductDraft = z.infer<typeof productDraftSchema>;
export type ProductMessagingDraft = z.infer<typeof productMessagingDraftSchema>;
export type SuggestedBuyerRole = z.infer<typeof suggestedBuyerRoleSchema>;
export type ProductAiResponse = z.infer<typeof productAiResponseSchema>;
export type ProductSynthesisResult = z.infer<typeof productSynthesisResultSchema>;

/** @deprecated Use SuggestedBuyerRole — kept for reading legacy setup runs / UI aliases. */
export type SuggestedPersona = SuggestedBuyerRole & {
  department?: string | null;
  whyThisPersonaMatters?: string | null;
  evidenceSummary?: string | null;
};

/** Legacy persona draft shape — historical ProductSetupRun.personaDraftsJson only. */
export type PersonaDraft = {
  suggestionKey: string;
  name: string;
  definition?: string | null;
  likelyTitles?: string[];
  department?: string | null;
  seniority?: string | null;
  responsibilities?: string[];
  ownershipAreas?: string[];
  painPoints?: string[];
  desiredOutcomesFromYourSolution?: string[];
  positiveRoleSignals?: string[];
  negativeRoleSignals?: string[];
  messagingNotes?: string | null;
  personaPositioning?: string | null;
  relevantProofPoints?: string[];
  likelyObjections?: string[];
  researchGuidance?: string | null;
  criteria?: Array<Record<string, unknown>>;
};

export const PRODUCT_SYNTHESIS_PROMPT_VERSION = "3";
