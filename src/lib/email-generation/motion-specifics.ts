/**
 * Runtime selection of concrete company-research specifics the model must
 * reference. Candidates and usability come from research structure + product
 * problem space at runtime — never from tenant/domain vocabulary lists.
 */

import {
  contentTokens,
  type EmailCompanyResearch,
  type ProductProblemSpace,
} from "@/lib/email-generation/company-research-use";

export type RequiredMotionSpecific = {
  text: string;
  sourceField: string;
  whyItMatters: string;
};

/** Ultra-generic English business nouns — not tenant/domain vocabulary. */
const GENERIC_BUSINESS_NOUNS = new Set([
  "analytics",
  "application",
  "applications",
  "business",
  "cloud",
  "company",
  "customer",
  "customers",
  "data",
  "digital",
  "enterprise",
  "management",
  "operations",
  "platform",
  "platforms",
  "product",
  "products",
  "service",
  "services",
  "software",
  "solution",
  "solutions",
  "suite",
  "suites",
  "support",
  "system",
  "systems",
  "team",
  "teams",
  "technology",
  "tools",
]);

const MAX_SPECIFICS = 3;
const MIN_SPECIFICS = 2;

export type MotionSpecificCandidate = {
  text: string;
  sourceField: string;
  tokens: string[];
};

/**
 * Split a free-text research field into phrase candidates without knowing
 * what kind of fact the tenant cares about.
 */
export function splitResearchPhrases(value: string): string[] {
  return value
    .split(/[,;/|]|[\n•]+|\band\b/gi)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .map((part) => part.replace(/^[\-–—:\s]+|[\-–—:\s]+$/g, "").trim())
    .filter((part) => part.length >= 3);
}

function candidateFrom(
  text: string,
  sourceField: string,
): MotionSpecificCandidate | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 120) return null;
  // Reject clearly truncated narrative debris.
  if (/^(?:and|or|while|inconsistent|categorizes|estimates)\b/i.test(cleaned)) {
    return null;
  }
  if (/\b(?:and|or)\s*$/i.test(cleaned) || /\(\s*$/.test(cleaned)) return null;
  if (/[($]\s*$/.test(cleaned) || /\bpub$/i.test(cleaned)) return null;
  // Prefer clause-like candidates; reject mid-sentence lowercase starts.
  if (/^[a-z]/.test(cleaned)) return null;
  const tokens = contentTokens(cleaned);
  if (tokens.length === 0) return null;
  return { text: cleaned, sourceField, tokens };
}

/**
 * Collect candidate specifics from research field structure only.
 */
export function collectMotionSpecificCandidates(
  research: EmailCompanyResearch,
): MotionSpecificCandidate[] {
  const out: MotionSpecificCandidate[] = [];
  const push = (text: string, sourceField: string) => {
    const candidate = candidateFrom(text, sourceField);
    if (candidate) out.push(candidate);
  };

  for (const value of research.customerTypes) {
    push(value, "customerTypes");
  }
  for (const value of research.primaryMarkets) {
    push(value, "primaryMarkets");
  }
  if (research.whatTheySell?.trim()) {
    for (const phrase of splitResearchPhrases(research.whatTheySell)) {
      push(phrase, "whatTheySell");
    }
  }
  if (research.businessModel?.trim()) {
    // Prefer compact model phrases; avoid chopping long narrative into debris.
    const model = research.businessModel.trim();
    if (model.length <= 100) {
      push(model, "businessModel");
    } else {
      for (const phrase of splitResearchPhrases(model)) {
        if (phrase.length <= 100) push(phrase, "businessModel");
      }
    }
  }
  // Narrative fields: sentence-level candidates only (digits / concrete clauses).
  for (const [field, value] of [
    ["companySizeContext", research.companySizeContext],
    ["companySummary", research.companySummary],
  ] as const) {
    if (!value?.trim()) continue;
    for (const sentence of value.split(/(?<=[.!?])\s+/)) {
      const trimmed = sentence.replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      if (/\d/.test(trimmed) || /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(trimmed)) {
        // Prefer a short clause around the first digit/name when the sentence is long.
        if (trimmed.length <= 110) {
          push(trimmed, field);
        } else {
          const digitMatch = trimmed.match(
            /[^.]{0,40}\d[^.]{0,40}(?:employees?|associates?|staff|people|locations?|offices?)[^.]{0,20}/i,
          );
          if (digitMatch?.[0]) push(digitMatch[0].trim(), field);
        }
      }
    }
  }

  const seen = new Set<string>();
  const deduped: MotionSpecificCandidate[] = [];
  for (const candidate of out) {
    const key = candidate.tokens.join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

/**
 * Usability without a build-time fact-type list:
 * - Reject phrases that are only generic business nouns ("Cloud Platform").
 * - Prefer phrases with digits, multi-token concreteness, or mixed specificity.
 * - Prefer overlap with problemsSolved / painPoints (relevance), not invention.
 * - Drop title-dominated phrases (same rule as B1 motion checks).
 */
export function scoreMotionSpecificUsability(
  candidate: MotionSpecificCandidate,
  input: {
    problemSpace: ProductProblemSpace;
    contactTitle?: string | null;
  },
): number {
  const titleTokens = new Set(contentTokens(input.contactTitle ?? ""));
  if (titleTokens.size > 0 && candidate.tokens.length >= 2) {
    const overlap = candidate.tokens.filter((token) =>
      titleTokens.has(token),
    ).length;
    if (overlap / candidate.tokens.length >= 0.5) return -Infinity;
  }

  const nonGeneric = candidate.tokens.filter(
    (token) => !GENERIC_BUSINESS_NOUNS.has(token),
  );
  if (nonGeneric.length === 0) return -Infinity;

  // Single-token generics already rejected; single non-generic tokens need
  // a digit or length signal to count as a usable specific.
  const hasDigit = /\d/.test(candidate.text);
  if (candidate.tokens.length === 1 && !hasDigit && candidate.text.length < 8) {
    return -Infinity;
  }

  let score = 0;
  score += nonGeneric.length * 3;
  score += Math.min(candidate.tokens.length, 6);
  if (hasDigit) score += 8;
  // Capitalized multi-word or camel/product-like tokens tend to be named entities.
  if (/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(candidate.text)) score += 6;
  if (/[A-Z]{2,}|[A-Z][a-z]+[A-Z]/.test(candidate.text)) score += 4;
  // Prefer mid-length concreteness over essay fragments.
  if (candidate.text.length >= 12 && candidate.text.length <= 70) score += 3;
  if (candidate.text.length > 90) score -= 4;

  const problemTokens = new Set(
    [
      ...input.problemSpace.problemsSolved,
      ...input.problemSpace.painPoints,
    ].flatMap((value) => contentTokens(value)),
  );
  const relevance = nonGeneric.filter((token) => problemTokens.has(token));
  score += relevance.length * 2;

  // Prefer named offerings / markets over long size/summary restatements.
  if (candidate.sourceField === "whatTheySell") score += 5;
  if (candidate.sourceField === "customerTypes") score += 4;
  if (candidate.sourceField === "primaryMarkets") score += 4;
  if (candidate.sourceField === "businessModel") score += 2;
  if (candidate.sourceField === "companySizeContext") {
    score += hasDigit ? 2 : -2;
    if (!/\bemployees?\b/i.test(candidate.text)) score -= 3;
  }
  if (candidate.sourceField === "companySummary") score -= 2;

  return score;
}

function whyItMatters(
  candidate: MotionSpecificCandidate,
  problemSpace: ProductProblemSpace,
): string {
  const problemTokens = [
    ...problemSpace.problemsSolved,
    ...problemSpace.painPoints,
  ];
  const candidateSet = new Set(candidate.tokens);
  for (const line of problemTokens) {
    const overlap = contentTokens(line).filter((token) =>
      candidateSet.has(token),
    );
    if (overlap.length > 0) {
      return `Connects this company's ${candidate.sourceField} detail to: ${line}`;
    }
  }
  return `Concrete ${candidate.sourceField} detail that distinguishes this company from a generic peer.`;
}

/**
 * Select 2–3 usable required specifics for generation.
 */
export function selectRequiredMotionSpecifics(input: {
  research: EmailCompanyResearch | null;
  problemSpace: ProductProblemSpace;
  contactTitle?: string | null;
}): RequiredMotionSpecific[] {
  if (!input.research) return [];
  const scored = collectMotionSpecificCandidates(input.research)
    .map((candidate) => ({
      candidate,
      score: scoreMotionSpecificUsability(candidate, {
        problemSpace: input.problemSpace,
        contactTitle: input.contactTitle,
      }),
    }))
    .filter((row) => Number.isFinite(row.score) && row.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected: RequiredMotionSpecific[] = [];
  const usedTokenKeys = new Set<string>();
  for (const row of scored) {
    if (selected.length >= MAX_SPECIFICS) break;
    const key = row.candidate.tokens.slice(0, 4).join(" ");
    if (usedTokenKeys.has(key)) continue;
    // Avoid near-duplicates that share most tokens with an already-selected item.
    const tooSimilar = selected.some((existing) => {
      const existingTokens = new Set(contentTokens(existing.text));
      const shared = row.candidate.tokens.filter((token) =>
        existingTokens.has(token),
      ).length;
      return (
        shared / Math.max(row.candidate.tokens.length, existingTokens.size) >=
        0.6
      );
    });
    if (tooSimilar) continue;
    usedTokenKeys.add(key);
    selected.push({
      text: row.candidate.text,
      sourceField: row.candidate.sourceField,
      whyItMatters: whyItMatters(row.candidate, input.problemSpace),
    });
  }

  if (selected.length < MIN_SPECIFICS && scored.length > selected.length) {
    for (const row of scored) {
      if (selected.length >= MIN_SPECIFICS) break;
      if (selected.some((item) => item.text === row.candidate.text)) continue;
      selected.push({
        text: row.candidate.text,
        sourceField: row.candidate.sourceField,
        whyItMatters: whyItMatters(row.candidate, input.problemSpace),
      });
    }
  }

  return selected.slice(0, MAX_SPECIFICS);
}

/**
 * True when the body references at least one required specific by name
 * (case-insensitive substring or majority of its non-generic tokens).
 */
export function bodyReferencesRequiredSpecific(
  body: string,
  specifics: RequiredMotionSpecific[],
): boolean {
  if (specifics.length === 0) return true;
  const normalizedBody = body.toLowerCase();
  const bodyTokens = new Set(contentTokens(body));
  return specifics.some((specific) => {
    if (normalizedBody.includes(specific.text.toLowerCase())) return true;
    const tokens = contentTokens(specific.text).filter(
      (token) => !GENERIC_BUSINESS_NOUNS.has(token),
    );
    if (tokens.length === 0) return false;
    const hit = tokens.filter((token) => bodyTokens.has(token)).length;
    return hit >= Math.ceil(tokens.length * 0.6);
  });
}

export const REQUIRED_MOTION_SPECIFICS_INSTRUCTIONS = `Required company specifics (when requiredMotionSpecifics is non-empty):
- You MUST reference at least one requiredMotionSpecifics[].text by name in the email body (exact phrase or unmistakable named reference).
- Prefer using it while framing the executive problem in paragraph 1, without restating the company's full description.
- Do not invent other company facts. Do not replace a required specific with a vague category synonym.
- If unsure which specific to use, pick the first item in the list.`;
