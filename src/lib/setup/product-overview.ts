/**
 * Pure helpers for the product setup overview (status cards).
 * Matching, counts, and truncation — no writes.
 */

import type { SuggestedBuyerRole } from "@/lib/product-research/contract";

export type ProductCompletionState =
  | "approved"
  | "needs_review"
  | "not_started";

export function productCompletionState(input: {
  approvalStatus: string;
}): ProductCompletionState {
  if (input.approvalStatus === "APPROVED") return "approved";
  if (
    input.approvalStatus === "NEEDS_REVIEW" ||
    input.approvalStatus === "DRAFT"
  ) {
    return "needs_review";
  }
  return "not_started";
}

export function productCompletionLabel(state: ProductCompletionState): string {
  switch (state) {
    case "approved":
      return "Approved";
    case "needs_review":
      return "Needs review";
    case "not_started":
      return "Not started";
  }
}

export function truncateText(
  value: string | null | undefined,
  maxChars: number,
): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export type CriterionCountRow = {
  isDisqualifier?: boolean | null;
  isRequired?: boolean | null;
  criterionType?: string | null;
};

export type PersonaCriteriaCountSummary = {
  total: number;
  exclusions: number;
  required: number;
};

/** Count criteria for overview display (exclusions / required / total). */
export function summarizePersonaCriteriaCounts(
  criteria: CriterionCountRow[],
): PersonaCriteriaCountSummary {
  let exclusions = 0;
  let required = 0;
  for (const row of criteria) {
    const type = (row.criterionType ?? "").toLowerCase();
    const isExclusion =
      row.isDisqualifier === true ||
      (type.includes("negative") && type.includes("signal"));
    if (isExclusion) {
      exclusions += 1;
      continue;
    }
    if (row.isRequired === true) required += 1;
  }
  return {
    total: criteria.length,
    exclusions,
    required,
  };
}

export function formatPersonaCriteriaSummary(
  summary: PersonaCriteriaCountSummary,
): string {
  return `${summary.total} criteria · ${summary.exclusions} exclusions · ${summary.required} required`;
}

export function titlesFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

export function formatLikelyTitles(
  value: unknown,
  maxChars = 72,
): string {
  return truncateText(titlesFromJson(value).join(", "), maxChars);
}

/**
 * Match saved personas to suggested roles by suggestionKey.
 *
 * - A suggestion is "built" when any saved persona has the same non-empty
 *   suggestionKey — it appears only under Saved, never in both groups.
 * - Saved personas with null/empty suggestionKey (custom personas, or roles
 *   built before keys were assigned) stay in Saved only and do not consume
 *   any suggestion; unmatched suggestions remain available to Build.
 */
export function partitionSuggestedRoles<
  TPersona extends { suggestionKey?: string | null },
  TRole extends { suggestionKey: string },
>(input: {
  savedPersonas: TPersona[];
  suggestedRoles: TRole[];
}): {
  savedPersonas: TPersona[];
  unbuiltSuggestions: TRole[];
  builtSuggestionKeys: string[];
} {
  const builtKeys = new Set(
    input.savedPersonas
      .map((p) => p.suggestionKey?.trim() ?? "")
      .filter(Boolean),
  );
  return {
    savedPersonas: input.savedPersonas,
    unbuiltSuggestions: input.suggestedRoles.filter(
      (role) => !builtKeys.has(role.suggestionKey),
    ),
    builtSuggestionKeys: [...builtKeys],
  };
}

/** Normalize productSetupRun.suggestedPersonasJson into SuggestedBuyerRole[]. */
export function normalizeSuggestedBuyerRoles(
  raw: unknown,
): SuggestedBuyerRole[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const name = String(r.name || "").trim();
      if (!name) return null;
      return {
        suggestionKey: String(r.suggestionKey || `legacy-${i + 1}`),
        name,
        likelyTitles: Array.isArray(r.likelyTitles)
          ? r.likelyTitles.map(String)
          : [],
        departmentFunction:
          (r.departmentFunction as string | null | undefined) ??
          (r.department as string | null | undefined) ??
          null,
        whyThisRoleMatters:
          (r.whyThisRoleMatters as string | null | undefined) ??
          (r.whyThisPersonaMatters as string | null | undefined) ??
          null,
        confidence:
          (r.confidence as "HIGH" | "MEDIUM" | "LOW" | undefined) ?? "MEDIUM",
        evidenceRefs: Array.isArray(r.evidenceRefs)
          ? (r.evidenceRefs as SuggestedBuyerRole["evidenceRefs"])
          : [],
      } satisfies SuggestedBuyerRole;
    })
    .filter(Boolean) as SuggestedBuyerRole[];
}
