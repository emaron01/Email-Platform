/**
 * Contact identity normalization — shared by import, suppression alignment,
 * collapse migration, and preview.
 *
 * Uses the same rules as suppression matching (trim, lower, strip +tag).
 */
export {
  normalizeSuppressionEmail as normalizeContactEmail,
} from "@/lib/suppression/normalize";

export function isContactEmailUsable(contact: {
  email?: string | null;
  normalizedEmail?: string | null;
}): boolean {
  return Boolean(contact.normalizedEmail ?? null);
}

export const CONTACT_UNUSABLE_REASON =
  "No email address — cannot be emailed, scored, or suppressed.";
