/**
 * Suppression matching is org-scoped and keyed on a normalized address.
 *
 * Import `normalizeEmail` (trim + lowercase) is unchanged so stored contact
 * emails keep plus-tags. Auth `emailNormalized` is also lowercase-only.
 *
 * Suppression matching additionally:
 *   - lowercases and trims
 *   - strips `+tag` from the local part (`alex+news@acme.test` → `alex@acme.test`)
 *
 * Dots in the local part are kept. Stripping them is Gmail-specific and would
 * collide unrelated addresses at other providers.
 */
export function normalizeSuppressionEmail(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!local || !domain) return null;
  const withoutPlus = local.split("+")[0] ?? local;
  if (!withoutPlus) return null;
  return `${withoutPlus}@${domain}`;
}
