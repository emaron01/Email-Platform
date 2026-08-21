/**
 * Email verification routing constants and URL preservation helpers.
 *
 * Operational note: Better Auth verification tokens are JWTs signed with
 * BETTER_AUTH_SECRET. Rotating the secret invalidates all outstanding
 * verification (and session) tokens. That is intentional — do not attempt
 * to make old tokens survive secret rotation. Users must request a new
 * verification email after a secret change.
 */

/** Post-verify landing used as Better Auth callbackURL (success + error). */
export const VERIFICATION_CALLBACK_PATH = "/post-verify";

/** Decode HTML entities commonly introduced when URLs are placed in hrefs. */
export function decodeHtmlAttrEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Extract the first href from HTML (attribute value as written). */
export function extractFirstHref(html: string): string | null {
  const match = html.match(/href\s*=\s*"([^"]+)"/i) || html.match(/href\s*=\s*'([^']+)'/i);
  return match?.[1] ?? null;
}

/**
 * Compare a Better Auth supplied verification URL to the href rendered into
 * EMAIL_VERIFICATION HTML. Browsers treat `&amp;` in attributes as `&`;
 * we compare after decoding so the semantic URL must match exactly.
 */
export function renderedVerificationHrefMatchesSupplied(
  suppliedUrl: string,
  renderedHtml: string,
): { ok: boolean; renderedHref: string | null } {
  const raw = extractFirstHref(renderedHtml);
  if (!raw) return { ok: false, renderedHref: null };
  const renderedHref = decodeHtmlAttrEntities(raw);
  return { ok: renderedHref === suppliedUrl, renderedHref };
}
