/**
 * Merge AI reinterpretation with existing criteria.
 * Manual edits are never silently overwritten.
 */

import type { InterpretedCriterionDraft } from "@/lib/criteria/types";

export type ExistingCriterionRow = {
  id: string;
  name: string;
  criterionType: string;
  manuallyEdited: boolean;
};

export type MergePlan = {
  /** Keep as-is (manual). */
  keepIds: string[];
  /** Soft-delete / replace non-manual rows. */
  replaceNonManual: boolean;
  /** New AI drafts to insert (excluding collisions with manual names/types). */
  insertDrafts: InterpretedCriterionDraft[];
};

function keyOf(name: string, criterionType: string): string {
  return `${criterionType.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

/**
 * Explicit merge behavior on reinterpret:
 * - Manually edited rows are preserved.
 * - Non-manual rows may be replaced by the new interpretation.
 * - New AI drafts that collide with a manual row's name+type are skipped.
 */
export function planCriterionReinterpretation(input: {
  existing: ExistingCriterionRow[];
  aiDrafts: InterpretedCriterionDraft[];
}): MergePlan {
  const manual = input.existing.filter((e) => e.manuallyEdited);
  const manualKeys = new Set(manual.map((m) => keyOf(m.name, m.criterionType)));

  const insertDrafts = input.aiDrafts.filter(
    (d) => !manualKeys.has(keyOf(d.name, d.criterionType)),
  );

  return {
    keepIds: manual.map((m) => m.id),
    replaceNonManual: true,
    insertDrafts,
  };
}
