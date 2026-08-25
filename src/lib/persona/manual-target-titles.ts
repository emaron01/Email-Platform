/**
 * Rep-approved likely titles are stored on Persona.targetTitles and marked in
 * manuallyEditedFields so research re-approval cannot silently drop them.
 * Interpretation never writes targetTitles.
 */

export const TARGET_TITLES_FIELD = "targetTitles";

export function asManualFieldList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

export function mergeManualEditedFields(
  existing: unknown,
  incoming: string[],
): string[] {
  return [...new Set([...asManualFieldList(existing), ...incoming])];
}

export function asTitleList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((title) => title.trim()).filter(Boolean);
}

/**
 * Append a display title unless an equivalent canonical form is already present.
 * Canonical comparison is injected so this helper stays free of scoring imports
 * when only list-merging is needed — callers pass canonicalTitle.
 */
export function appendTargetTitle(
  existingTitles: unknown,
  title: string,
  canonicalize: (value: string) => string,
): string[] {
  const next = title.trim();
  if (!next) return asTitleList(existingTitles);
  const titles = asTitleList(existingTitles);
  const canonical = canonicalize(next);
  if (titles.some((existing) => canonicalize(existing) === canonical)) {
    return titles;
  }
  return [...titles, next];
}
