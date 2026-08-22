/**
 * Compact Product evidence for Persona synthesis (relevance selection, not lossy wipe).
 */

import type { EvidenceExcerpt } from "@/lib/product-research/prompt";

const ROLE_KEYWORD_SETS: Record<string, RegExp> = {
  cro: /\b(forecast|commit|pipeline|coaching|quota|revenue|sales leader|cro)\b/i,
  revops:
    /\b(revops|crm|process|governance|reporting|forecast ops|sales ops|data quality)\b/i,
  sales: /\b(sales|pipeline|deal|quota|ae|sdr|opportunity)\b/i,
  it: /\b(it|infrastructure|security|cloud|integration|platform|ops)\b/i,
  marketing: /\b(marketing|demand|pipeline|campaign|brand|abm)\b/i,
  finance: /\b(finance|cfo|budget|roi|cost|procurement)\b/i,
};

function roleBuckets(roleName: string): RegExp[] {
  const n = roleName.toLowerCase();
  const out: RegExp[] = [];
  if (/cro|chief revenue|vp sales|svp sales|head of sales/.test(n)) {
    out.push(ROLE_KEYWORD_SETS.cro!, ROLE_KEYWORD_SETS.sales!);
  }
  if (/revops|revenue operations|sales operations/.test(n)) {
    out.push(ROLE_KEYWORD_SETS.revops!);
  }
  if (/infrastructure|it |cio|cto|security|platform/.test(n)) {
    out.push(ROLE_KEYWORD_SETS.it!);
  }
  if (/marketing|cmo/.test(n)) out.push(ROLE_KEYWORD_SETS.marketing!);
  if (/finance|cfo/.test(n)) out.push(ROLE_KEYWORD_SETS.finance!);
  if (out.length === 0) out.push(/\b(product|value|customer|outcome|problem)\b/i);
  return out;
}

/**
 * Select Product evidence excerpts most relevant to a buyer role.
 * Preserves source identity; caps total chars for synthesis context.
 */
export function selectProductEvidenceForPersona(input: {
  roleName: string;
  excerpts: EvidenceExcerpt[];
  maxChars?: number;
}): EvidenceExcerpt[] {
  const maxChars = input.maxChars ?? 24_000;
  const patterns = roleBuckets(input.roleName);
  const scored = input.excerpts.map((e) => {
    const text = e.text || "";
    let score = Math.min(3, Math.floor(text.length / 2000));
    for (const p of patterns) {
      const matches = text.match(new RegExp(p.source, "gi"));
      score += matches ? Math.min(8, matches.length) : 0;
    }
    return { excerpt: e, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const selected: EvidenceExcerpt[] = [];
  let used = 0;
  for (const row of scored) {
    if (used >= maxChars) break;
    const slice = row.excerpt.text.slice(0, Math.max(500, maxChars - used));
    selected.push({ ...row.excerpt, text: slice });
    used += slice.length;
  }
  return selected.length > 0 ? selected : input.excerpts.slice(0, 3);
}
