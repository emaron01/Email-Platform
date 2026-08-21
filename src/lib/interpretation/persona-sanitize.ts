/**
 * Post-process AI-interpreted Persona criteria for production safety.
 * Generic — not product-specific.
 */

import type { InterpretedCriterionDraft } from "@/lib/criteria/types";
import {
  decomposeProseIntoAtomicTargets,
  looksLikeCampaignCta,
} from "@/lib/persona/decompose";

const MAX_TARGET_LEN = 180;

function targetAsString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value == null) return "";
  return String(value);
}

/**
 * Drop campaign-CTA-as-outcome, messaging-as-fit, and giant prose blobs.
 * Expand oversized targets into atomic snippets.
 */
export function sanitizePersonaInterpretedCriteria(
  drafts: InterpretedCriterionDraft[],
): InterpretedCriterionDraft[] {
  const out: InterpretedCriterionDraft[] = [];
  let sort = 0;

  for (const d of drafts) {
    const type = d.criterionType.toLowerCase();
    if (type === "messaging" || type === "messaging_notes") continue;

    if (type === "desired_outcome" || type === "desired_outcomes") {
      const probe = targetAsString(d.targetValue) || d.name;
      if (looksLikeCampaignCta(probe)) continue;
    }

    if (
      type === "title_pattern" ||
      type === "title" ||
      type === "titles"
    ) {
      // Leave list targets as-is; single generic labels already discouraged by prompt.
    }

    const tv = d.targetValue;
    if (typeof tv === "string" && tv.length > MAX_TARGET_LEN) {
      const snippets = decomposeProseIntoAtomicTargets(tv, { maxItems: 6 });
      for (const snippet of snippets) {
        out.push({
          ...d,
          name: snippet.length > 80 ? `${snippet.slice(0, 79)}…` : snippet,
          targetValue: snippet,
          operator: d.operator === "CONTAINS" ? "EXISTS" : d.operator,
          sortOrder: sort++,
        });
      }
      continue;
    }

    out.push({ ...d, sortOrder: sort++ });
  }

  return out;
}
