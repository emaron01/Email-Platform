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

/**
 * Orthography signals for a named offering — no product-name vocabulary.
 * CamelCase/Pascal products, multi-token ALL CAPS, long single ALL-CAPS codes.
 */
export function extractNamedOfferingLabels(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(
    /\b[A-Z][a-z]+[A-Z][A-Za-z0-9]*\b/g,
  )) {
    found.push(match[0]);
  }
  for (const match of text.matchAll(
    /\b[A-Z]{2,}(?:[\s_-]+[A-Z0-9]{2,})+\b/g,
  )) {
    found.push(match[0]);
  }
  for (const match of text.matchAll(/\b[A-Z][A-Z0-9]{5,}\b/g)) {
    found.push(match[0]);
  }
  // Prefer longer labels when one contains another (METRICS vs METRICS SERVICE).
  const sorted = [...found].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const label of sorted) {
    const key = label.toLowerCase();
    if (
      out.some(
        (existing) =>
          existing.toLowerCase().includes(key) ||
          key.includes(existing.toLowerCase()),
      )
    ) {
      continue;
    }
    out.push(label);
  }
  return out;
}

/**
 * True when a split phrase looks like a distinct named offering (product
 * orthography or a concrete capitalized catalog clause) — not generic nouns.
 */
export function isNamedOfferingPhrase(phrase: string): boolean {
  const cleaned = phrase.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 100) return false;
  if (isUnusableEmailFirmographicPhrase(cleaned)) return false;
  if (extractNamedOfferingLabels(cleaned).length > 0) return true;
  const tokens = contentTokens(cleaned);
  const nonGeneric = tokens.filter(
    (token) => !GENERIC_BUSINESS_NOUNS.has(token),
  );
  if (nonGeneric.length < 2) return false;
  return /^[A-Z]/.test(cleaned);
}

/**
 * Count distinct named offerings in whatTheySell by structure/orthography —
 * not by matching a list of known product names.
 */
export function countNamedOfferings(whatTheySell: string): number {
  const fromLabels = extractNamedOfferingLabels(whatTheySell).length;
  const fromPhrases = splitResearchPhrases(whatTheySell).filter((phrase) =>
    isNamedOfferingPhrase(phrase),
  ).length;
  return Math.max(fromLabels, fromPhrases);
}

function formatOfferingList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * When multiple named offerings exist, the portfolio (not one SKU) is the
 * usable email specific.
 */
export function buildPortfolioOfferingSpecific(whatTheySell: string): string {
  const raw = whatTheySell.replace(/\s+/g, " ").trim();
  const labels = extractNamedOfferingLabels(raw);
  const suiteLead = raw.match(
    /^([^.;:\n]{10,80}?\b(?:suite|portfolio|product family)\b[^.;:\n]{0,40})/i,
  );
  if (suiteLead) {
    const lead = suiteLead[1].trim().replace(/:\s*$/, "");
    if (labels.length >= 2) {
      for (let n = Math.min(labels.length, 4); n >= 2; n -= 1) {
        const combined = `${lead} spanning ${formatOfferingList(labels.slice(0, n))}`;
        if (combined.length <= 120) return combined;
      }
    }
    if (lead.length <= 120) return lead;
  }
  if (labels.length >= 2) {
    for (let n = Math.min(labels.length, 5); n >= 2; n -= 1) {
      const list = formatOfferingList(labels.slice(0, n));
      if (list.length <= 120) return list;
    }
  }
  if (raw.length <= 120) return raw;
  return raw.slice(0, 117).replace(/\s+\S*$/, "").trim();
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
 * Collect candidates from fields that describe what the company DOES or WHO
 * it serves. Firmographic fields (size, location, directory listings) are
 * excluded — they qualify a company; they are not email personalization.
 */
export const EMAIL_MOTION_SPECIFIC_SOURCE_FIELDS = [
  "customerTypes",
  "primaryMarkets",
  "whatTheySell",
  "businessModel",
] as const;

export type EmailMotionSpecificSourceField =
  (typeof EMAIL_MOTION_SPECIFIC_SOURCE_FIELDS)[number];

/** Geographic scaffolding — not market/customer substance. */
const GEO_SCAFFOLD_TOKENS = new Set([
  "area",
  "areas",
  "atlantic",
  "bay",
  "central",
  "cities",
  "city",
  "coast",
  "counties",
  "county",
  "domestic",
  "east",
  "global",
  "greater",
  "gulf",
  "international",
  "local",
  "metro",
  "metropolitan",
  "midwest",
  "midwestern",
  "nationwide",
  "north",
  "northeast",
  "northwest",
  "pacific",
  "region",
  "regional",
  "regions",
  "south",
  "southeast",
  "southwest",
  "state",
  "states",
  "united",
  "west",
]);

/** Full US state / DC names as normalized phrases. */
const US_STATE_PHRASES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "district of columbia",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
]);

const COUNTRY_GEO_PHRASES = new Set([
  "america",
  "australia",
  "britain",
  "canada",
  "china",
  "england",
  "europe",
  "france",
  "germany",
  "india",
  "japan",
  "mexico",
  "uk",
  "united kingdom",
  "united states",
  "united states of america",
  "us",
  "usa",
]);

const COUNTRY_GEO_TOKENS = new Set([
  "america",
  "american",
  "australia",
  "britain",
  "british",
  "canada",
  "canadian",
  "china",
  "england",
  "europe",
  "european",
  "france",
  "germany",
  "india",
  "japan",
  "mexico",
  "uk",
  "us",
  "usa",
]);

const US_STATE_TOKENS = new Set(
  [...US_STATE_PHRASES].flatMap((phrase) => phrase.split(" ")),
);

function normalizePlacePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a phrase describes the company as an object of research
 * (headcount, HQ, directory listing) rather than what it does or who it serves.
 */
export function isFirmographicResearchObjectPhrase(text: string): boolean {
  return (
    /\b(?:employees?|headcount|associates?|fte)\b/i.test(text) ||
    /\b(?:\d[\d,]*)\s+(?:staff|workforce)\b/i.test(text) ||
    /\b(?:staff|workforce)\s+of\b/i.test(text) ||
    /\b(?:linkedin|crunchbase|owler|leadiq|zoominfo|directory)\b/i.test(text) ||
    /\b(?:headquarters|hq|based in|located in|offices? in)\b/i.test(text) ||
    /\b\d{2,4}\s*[-–—]\s*\d{2,4}\s+employees?\b/i.test(text)
  );
}

/**
 * True when a phrase is only a place label (state, country, metro area) with
 * no offering / customer / market-segment substance. "United States long-term
 * care pharmacy market" keeps industry tokens after geo strip; "Greater
 * Houston metropolitan area" and "Texas" do not.
 */
export function isLocationOnlyFragment(text: string): boolean {
  const normalized = normalizePlacePhrase(text);
  if (US_STATE_PHRASES.has(normalized) || COUNTRY_GEO_PHRASES.has(normalized)) {
    return true;
  }

  if (
    /\b(?:metropolitan|metro)\s+area\b/i.test(text) ||
    /\b(?:headquarters|hq|based in|located in|offices? in)\b/i.test(text)
  ) {
    const tokens = contentTokens(text);
    const remaining = tokens.filter(
      (token) =>
        !GEO_SCAFFOLD_TOKENS.has(token) &&
        !US_STATE_TOKENS.has(token) &&
        !COUNTRY_GEO_TOKENS.has(token),
    );
    // Metro/HQ phrasing with only a place leftover is location, not market.
    if (remaining.length <= 2) return true;
  }

  const tokens = contentTokens(text);
  if (tokens.length === 0) return true;
  const remaining = tokens.filter(
    (token) =>
      !GEO_SCAFFOLD_TOKENS.has(token) &&
      !US_STATE_TOKENS.has(token) &&
      !COUNTRY_GEO_TOKENS.has(token),
  );
  return remaining.length === 0;
}

/**
 * Usable in outreach when it describes what the company does or who it
 * serves — not when it describes the company as a researched object.
 */
export function isUnusableEmailFirmographicPhrase(text: string): boolean {
  return (
    isFirmographicResearchObjectPhrase(text) || isLocationOnlyFragment(text)
  );
}

/**
 * Collect candidate specifics from research field structure only.
 */
export function collectMotionSpecificCandidates(
  research: EmailCompanyResearch,
): MotionSpecificCandidate[] {
  const out: MotionSpecificCandidate[] = [];
  const push = (text: string, sourceField: string) => {
    if (isUnusableEmailFirmographicPhrase(text)) return;
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
    const raw = research.whatTheySell.trim();
    // Multiple named offerings → portfolio is the specific, not one SKU.
    if (countNamedOfferings(raw) >= 2) {
      push(buildPortfolioOfferingSpecific(raw), "whatTheySell");
    } else {
      for (const phrase of splitResearchPhrases(raw)) {
        push(phrase, "whatTheySell");
      }
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
  // Intentionally omit companySizeContext and companySummary: those describe
  // the company as a researched object (headcount, HQ, directories), not motion.

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
 * - Only motion fields (offerings, markets, customers, business model).
 * - Reject firmographic "research object" phrases (headcount, HQ, directories).
 * - Reject phrases that are only generic business nouns ("Cloud Platform").
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
  if (
    !EMAIL_MOTION_SPECIFIC_SOURCE_FIELDS.includes(
      candidate.sourceField as EmailMotionSpecificSourceField,
    )
  ) {
    return -Infinity;
  }
  if (isUnusableEmailFirmographicPhrase(candidate.text)) {
    return -Infinity;
  }

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
  // length signal to count as a usable specific (digits alone are often size).
  if (candidate.tokens.length === 1 && candidate.text.length < 8) {
    return -Infinity;
  }

  let score = 0;
  score += nonGeneric.length * 3;
  score += Math.min(candidate.tokens.length, 6);
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

  if (candidate.sourceField === "whatTheySell") {
    score += 5;
    // Prefer portfolio framing when the candidate itself names multiple offerings.
    if (extractNamedOfferingLabels(candidate.text).length >= 2) score += 8;
    if (/\b(?:suite|portfolio|spanning)\b/i.test(candidate.text)) score += 4;
  }
  if (candidate.sourceField === "customerTypes") score += 4;
  if (candidate.sourceField === "primaryMarkets") score += 4;
  if (candidate.sourceField === "businessModel") score += 2;

  return score;
}

function whyItMatters(
  candidate: MotionSpecificCandidate,
  problemSpace: ProductProblemSpace,
): string {
  if (
    candidate.sourceField === "whatTheySell" &&
    (extractNamedOfferingLabels(candidate.text).length >= 2 ||
      /\b(?:suite|portfolio|spanning)\b/i.test(candidate.text))
  ) {
    return "Multi-offering portfolio — reason from the portfolio motion (several lines into overlapping accounts), not a single SKU.";
  }
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
- Reason FROM at least one requiredMotionSpecifics[].text to the executive problem. The specific must do causal work in the sentence (market, offering, portfolio, or customer type that makes the problem acute for them).
- When the specific is a multi-offering suite or portfolio, reason from that portfolio motion (several products into overlapping accounts) — do not narrow the email to a single SKU.
- Do NOT decorate a generic problem with a bolted-on product name, and do NOT quote research back to the recipient (no headcount, LinkedIn, directories, or "your company has N employees").
- Prefer a framing like "In [market / for teams selling X / when serving Y / across a portfolio of …], [problem]…" — not "With [product name], [generic problem]…" or "When selling [one SKU], …".
- Reference the chosen specific by name (exact phrase or unmistakable named reference). Do not invent other company facts or replace it with a vague category synonym.
- If unsure which specific to use, pick the first item in the list.`;
