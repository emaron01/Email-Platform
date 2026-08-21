/**
 * Transform validated PRODUCT_AI response into UI/persistence drafts.
 * Assigns collision-safe suggestionKeys in application code.
 */

import type {
  CanonicalPersona,
  PersonaDraft,
  ProductAiResponse,
  ProductSynthesisResult,
  SuggestedPersona,
} from "@/lib/product-research/contract";

/**
 * Stable within a setup run: normalized name + ordinal, with collision suffix.
 * Not used for auth or tenant identity.
 */
export function assignSuggestionKeys(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((rawName, index) => {
    const base =
      rawName
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "persona";
    let key = `${base}-${index + 1}`;
    let n = 2;
    while (used.has(key)) {
      key = `${base}-${index + 1}-${n}`;
      n += 1;
    }
    used.add(key);
    return key;
  });
}

function toSuggestedPersona(
  persona: CanonicalPersona,
  suggestionKey: string,
): SuggestedPersona {
  return {
    suggestionKey,
    name: persona.name,
    likelyTitles: persona.likelyTitles,
    department: persona.department,
    seniority: persona.seniority,
    whyThisPersonaMatters: persona.whyThisPersonaMatters,
    evidenceSummary: persona.evidenceSummary,
    confidence: persona.confidence,
  };
}

function toPersonaDraft(
  persona: CanonicalPersona,
  suggestionKey: string,
): PersonaDraft {
  return {
    suggestionKey,
    name: persona.name,
    definition: persona.definition,
    likelyTitles: persona.likelyTitles,
    department: persona.department,
    seniority: persona.seniority,
    responsibilities: persona.responsibilities,
    ownershipAreas: persona.ownershipAreas,
    painPoints: persona.painPoints,
    desiredOutcomesFromYourSolution: persona.desiredOutcomesFromSolution,
    positiveRoleSignals: persona.positiveSignals,
    negativeRoleSignals: persona.negativeSignals,
    messagingNotes: persona.messagingNotes,
    personaPositioning: persona.personaPositioning,
    relevantProofPoints: persona.relevantProofPoints,
    likelyObjections: persona.likelyObjections,
    researchGuidance: persona.researchGuidance,
    criteria: persona.criteria,
  };
}

/**
 * Derive suggestedPersonas + personaDrafts from one canonical personas[] array.
 */
export function transformProductAiResponse(
  ai: ProductAiResponse,
  options?: { allowedSourceIds?: Set<string> },
): ProductSynthesisResult {
  const keys = assignSuggestionKeys(ai.personas.map((p) => p.name));
  const allowed = options?.allowedSourceIds;

  const productDraft = {
    ...ai.productDraft,
    evidenceRefs: (ai.productDraft.evidenceRefs ?? []).map((ref) => ({
      ...ref,
      sourceIds: allowed
        ? (ref.sourceIds ?? []).filter((id) => allowed.has(id))
        : (ref.sourceIds ?? []),
    })),
  };

  const personas = ai.personas.map((p) => {
    if (!allowed) return p;
    return {
      ...p,
      evidenceRefs: (p.evidenceRefs ?? []).map((ref) => ({
        ...ref,
        sourceIds: (ref.sourceIds ?? []).filter((id) => allowed.has(id)),
      })),
    };
  });

  const suggestedPersonas = personas.map((p, i) =>
    toSuggestedPersona(p, keys[i]!),
  );
  const personaDrafts = personas.map((p, i) => toPersonaDraft(p, keys[i]!));

  return {
    productDraft,
    productMessagingDraft: ai.productMessagingDraft,
    suggestedPersonas,
    personaDrafts,
  };
}
