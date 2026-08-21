/**
 * Redaction helpers — never log or persist secrets.
 */

export function redactSecrets(text: string, apiKey?: string): string {
  let out = text;
  if (apiKey && apiKey.length > 0) {
    out = out.split(apiKey).join("[REDACTED_API_KEY]");
  }
  // Common credential patterns in URLs
  out = out.replace(/([?&](?:api_key|key|token|access_token)=)[^&\s]+/gi, "$1[REDACTED]");
  out = out.replace(/\/\/([^:@\s]+):([^@/\s]+)@/g, "//$1:[REDACTED]@");
  return out;
}

/**
 * Store only a sanitized URL identifier for provenance (host + pathname, no query/userinfo).
 */
export function sanitizeModelUrlIdentifier(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "") || parsed.origin;
  } catch {
    return "[invalid-model-url]";
  }
}
