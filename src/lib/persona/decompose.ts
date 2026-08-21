/**
 * Decompose rich natural-language Persona prose into concise atomic snippets
 * for structured criteria (legacy fallback and prompt guidance examples).
 *
 * Generic — not product- or industry-specific.
 */

const MAX_ATOMIC = 12;
const MAX_SNIPPET_LEN = 160;
const MIN_SNIPPET_LEN = 8;

/**
 * Split prose on bullets, newlines, semicolons, and sentence boundaries into
 * independently assessable snippets. Does not invent meaning.
 */
export function decomposeProseIntoAtomicTargets(
  text: string,
  options?: { maxItems?: number },
): string[] {
  const maxItems = options?.maxItems ?? MAX_ATOMIC;
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const chunks: string[] = [];
  for (const line of raw.split(/\n+/)) {
    const cleaned = line.replace(/^[\s•\-*–—]+\s*/, "").trim();
    if (!cleaned) continue;
    for (const part of cleaned.split(/;+/)) {
      const p = part.trim();
      if (!p) continue;
      if (p.length <= MAX_SNIPPET_LEN) {
        chunks.push(p);
      } else {
        for (const sentence of p.split(/(?<=[.!?])\s+/)) {
          const s = sentence.trim();
          if (s) chunks.push(s.length > MAX_SNIPPET_LEN ? `${s.slice(0, MAX_SNIPPET_LEN - 1)}…` : s);
        }
      }
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.toLowerCase();
    if (c.length < MIN_SNIPPET_LEN) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= maxItems) break;
  }

  // If nothing split usefully, keep a single truncated snippet rather than dumping paragraphs.
  if (out.length === 0 && raw.length >= MIN_SNIPPET_LEN) {
    out.push(
      raw.length > MAX_SNIPPET_LEN
        ? `${raw.slice(0, MAX_SNIPPET_LEN - 1)}…`
        : raw,
    );
  }

  return out;
}

/** Titles that look like role categories, not literal job titles. */
const GENERIC_ROLE_LABELS = new Set(
  [
    "sales leader",
    "sales leaders",
    "leader",
    "leaders",
    "executive",
    "executives",
    "management",
    "manager",
    "managers",
    "decision maker",
    "decision makers",
    "buyer",
    "buyers",
  ].map((s) => s.toLowerCase()),
);

/**
 * Filter user-supplied title evidence: drop generic role categories unless the
 * user explicitly listed only that token as a title (still drop known generics).
 */
export function filterLiteralTitleEvidence(titles: string[]): string[] {
  return titles
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !GENERIC_ROLE_LABELS.has(t.toLowerCase()));
}

/** Campaign / offer CTA phrases that must never become Desired Solution Outcomes. */
export const CAMPAIGN_CTA_PHRASES = [
  "meeting",
  "demo",
  "reply",
  "call",
  "trial",
  "assessment",
  "book a meeting",
  "schedule a demo",
  "meeting/demo",
  "book demo",
] as const;

export function looksLikeCampaignCta(value: string): boolean {
  const n = value.trim().toLowerCase().replace(/\s+/g, " ");
  return (CAMPAIGN_CTA_PHRASES as readonly string[]).some(
    (p) => n === p || n === `${p}s`,
  );
}
