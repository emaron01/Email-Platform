/**
 * Transform PRODUCT_AI response → app ProductSynthesisResult with suggestionKeys.
 */

import type {
  ProductAiResponse,
  ProductSynthesisResult,
  SuggestedBuyerRole,
} from "@/lib/product-research/contract";

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
        .slice(0, 48) || "role";
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

export function transformProductAiResponse(
  ai: ProductAiResponse,
  options?: { allowedSourceIds?: Set<string> },
): ProductSynthesisResult {
  const allowed = options?.allowedSourceIds;
  const keys = assignSuggestionKeys(ai.suggestedBuyerRoles.map((r) => r.name));

  const productDraft = {
    ...ai.productDraft,
    evidenceRefs: (ai.productDraft.evidenceRefs ?? []).map((ref) => ({
      ...ref,
      sourceIds: allowed
        ? (ref.sourceIds ?? []).filter((id) => allowed.has(id))
        : (ref.sourceIds ?? []),
    })),
  };

  const suggestedBuyerRoles: SuggestedBuyerRole[] = ai.suggestedBuyerRoles.map(
    (role, i) => ({
      suggestionKey: keys[i]!,
      name: role.name,
      likelyTitles: role.likelyTitles,
      departmentFunction: role.departmentFunction ?? null,
      whyThisRoleMatters: role.whyThisRoleMatters ?? null,
      confidence: role.confidence,
      evidenceRefs: (role.evidenceRefs ?? []).map((ref) => ({
        ...ref,
        sourceIds: allowed
          ? (ref.sourceIds ?? []).filter((id) => allowed.has(id))
          : (ref.sourceIds ?? []),
      })),
    }),
  );

  return {
    productDraft,
    productMessagingDraft: ai.productMessagingDraft,
    suggestedBuyerRoles,
  };
}
