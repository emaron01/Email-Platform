/**
 * Product synthesis contract (v4) — Product draft + lightweight SuggestedBuyerRoles.
 * Full Persona drafts are produced later by PERSONA_AI (one role at a time).
 */

import { z } from "zod";
import {
  normalizeAbsentNulls,
  normalizeConfidenceValue,
  normalizeEvidenceRefs,
  summarizeCoercedFields,
} from "@/lib/ai/contract-normalize";
import type { StructuredParseResult } from "@/lib/ai/types";

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

/** Reproduced from production validation failure (Aug 2026). */
export const PRODUCT_AI_MALFORMED_FIXTURE = {
  productDraft: {
    description: "Tool",
    evidenceRefs: [{ sourceIds: ["s1"] }],
  },
  productMessagingDraft: { primaryPositioning: "Save time" },
  suggestedBuyerRoles: [
    {
      name: "CRO",
      likelyTitles: ["CRO"],
      whyThisRoleMatters: "Owns forecast",
      confidence: "High",
      evidenceRefs: [{ sourceIds: ["s1"] }],
    },
    {
      name: "VP Sales",
      confidence: "Medium",
      evidenceRefs: [{ sourceIds: ["s2"] }],
    },
    {
      name: "RevOps",
      confidence: "medium",
      evidenceRefs: [{ sourceIds: ["s3"], note: null }],
    },
    {
      name: "CFO",
      confidence: "MEDIUM-HIGH",
      evidenceRefs: [{ sourceIds: ["s4"] }],
    },
  ],
} as const;

function normalizeSuggestedBuyerRoles(
  value: unknown,
  coercedFields: Set<string>,
): unknown {
  if (!Array.isArray(value)) return [];
  return value.map((role, index) => {
    if (!role || typeof role !== "object") return role;
    const row = { ...(role as Record<string, unknown>) };
    row.confidence = normalizeConfidenceValue(
      row.confidence,
      coercedFields,
      `suggestedBuyerRoles[${index}].confidence`,
    );
    row.evidenceRefs = normalizeEvidenceRefs(
      row.evidenceRefs,
      coercedFields,
      `suggestedBuyerRoles[${index}].evidenceRefs`,
    );
    return row;
  });
}

function normalizeProductDraft(value: unknown, coercedFields: Set<string>): unknown {
  if (!value || typeof value !== "object") return value ?? {};
  const draft = { ...(value as Record<string, unknown>) };
  draft.evidenceRefs = normalizeEvidenceRefs(
    draft.evidenceRefs,
    coercedFields,
    "productDraft.evidenceRefs",
  );
  return draft;
}

/** Defensive parse — normalizes ambiguous model output before strict validation. */
export function parseProductAiResponse(
  raw: unknown,
): StructuredParseResult<ProductAiResponse> {
  const coercedFields = new Set<string>();
  if (!raw || typeof raw !== "object") {
    return {
      data: productAiResponseSchema.parse({
        productDraft: {},
        productMessagingDraft: {},
        suggestedBuyerRoles: [],
      }),
      coercedFields: [],
    };
  }

  const root = normalizeAbsentNulls(raw) as Record<string, unknown>;
  const normalized = {
    ...root,
    productDraft: normalizeProductDraft(root.productDraft, coercedFields),
    productMessagingDraft: root.productMessagingDraft ?? {},
    suggestedBuyerRoles: normalizeSuggestedBuyerRoles(
      root.suggestedBuyerRoles,
      coercedFields,
    ),
  };

  return {
    data: productAiResponseSchema.parse(normalized),
    coercedFields: summarizeCoercedFields(coercedFields),
  };
}

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

export const PRODUCT_SYNTHESIS_PROMPT_VERSION = "5";
