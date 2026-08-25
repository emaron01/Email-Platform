/**
 * Factual ICP actuals: list fields first, then company research, else unresolved.
 *
 * Evidence class says where to look first, not the only permitted source.
 * Hedged or incomplete research is UNKNOWN — never a midpoint or a guess.
 */

import type { CriterionSnapshot } from "@/lib/criteria/types";

export const NUMERIC_EVIDENCE_KIND = "numeric-evidence" as const;

export type NumericEvidence = {
  kind: typeof NUMERIC_EVIDENCE_KIND;
  min: number | null;
  max: number | null;
  display: string;
};

export type ActualProvenanceSource = "LIST" | "RESEARCH";

export type ActualProvenance = {
  source: ActualProvenanceSource;
  field: string;
  excerpt: string | null;
  displayValue: string;
  label: string;
  hedged: boolean;
};

export type CompanyListActuals = {
  industry?: string | null;
  employeeCount?: number | null;
  revenue?: { toString(): string } | number | string | null;
  location?: string | null;
};

export type CompanyResearchActuals = {
  relevantTechnologies?: string[] | null;
  buyingSignals?: string[] | null;
  riskSignals?: string[] | null;
  primaryMarkets?: string[] | null;
  companySizeContext?: string | null;
  companySummary?: string | null;
  whatTheySell?: string | null;
  businessModel?: string | null;
};

export type CompanyActualResolution = {
  value: unknown;
  provenance: ActualProvenance | null;
};

/**
 * Hedge words on the claim itself. A cited source ("LinkedIn lists…") is not a hedge.
 * "approximately 200 employees" is; "201–500 employees" is not.
 */
export const RESEARCH_HEDGE_PATTERN =
  /\b(approximately|approx\.?|around|about|roughly|estimated|estimates?|perhaps|maybe|possibly|likely|appears?|seems?|could be|might be|unclear|unknown|reportedly|believed|allegedly|or so)\b/i;

const EMPLOYEE_WORD = /(?:employees?|headcount|people|staff|ftes?)/i;

export function isNumericEvidence(value: unknown): value is NumericEvidence {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { kind?: unknown }).kind === NUMERIC_EVIDENCE_KIND,
  );
}

export function isHedgedResearchText(text: string): boolean {
  return RESEARCH_HEDGE_PATTERN.test(text);
}

function hasListValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function listText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "toString" in value) {
    return String(value.toString()).trim();
  }
  return String(value).trim();
}

function parseCountToken(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function sentenceAt(text: string, index: number, length: number): string {
  const before = text.slice(0, index);
  const after = text.slice(index + length);
  const start = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("\n"),
  );
  const ends = [".", "!", "?", "\n"]
    .map((mark) => after.indexOf(mark))
    .filter((pos) => pos >= 0);
  const endRel = ends.length > 0 ? Math.min(...ends) : after.length;
  return text.slice(start + 1, index + length + endRel + 1).trim();
}

function provenanceLabel(
  shortName: string,
  displayValue: string,
  source: ActualProvenanceSource,
): string {
  const from = source === "LIST" ? "from your list" : "from research";
  return `${shortName}: ${displayValue} (${from})`;
}

function listResolution(
  shortName: string,
  field: string,
  value: unknown,
  displayValue: string,
): CompanyActualResolution {
  return {
    value,
    provenance: {
      source: "LIST",
      field,
      excerpt: null,
      displayValue,
      label: provenanceLabel(shortName, displayValue, "LIST"),
      hedged: false,
    },
  };
}

function unresolved(): CompanyActualResolution {
  return { value: null, provenance: null };
}

function hedgedResolution(
  shortName: string,
  field: string,
  excerpt: string,
): CompanyActualResolution {
  return {
    value: null,
    provenance: {
      source: "RESEARCH",
      field,
      excerpt,
      displayValue: excerpt,
      label: `${shortName}: unresolved (hedged research)`,
      hedged: true,
    },
  };
}

function researchResolution(
  shortName: string,
  field: string,
  value: unknown,
  displayValue: string,
  excerpt: string,
): CompanyActualResolution {
  return {
    value,
    provenance: {
      source: "RESEARCH",
      field,
      excerpt,
      displayValue,
      label: provenanceLabel(shortName, displayValue, "RESEARCH"),
      hedged: false,
    },
  };
}

type HeadcountHit = {
  evidence: NumericEvidence;
  excerpt: string;
  hedged: boolean;
};

function extractHeadcount(text: string, requireEmployeeWord: boolean): HeadcountHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const rangeRe =
    /(\d{1,3}(?:,\d{3})*)\s*[–—-]\s*(\d{1,3}(?:,\d{3})*)(?:\s*\+)?(?:\s*(?:employees?|headcount|people|staff|ftes?))?/gi;
  for (const match of trimmed.matchAll(rangeRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    if (requireEmployeeWord && !EMPLOYEE_WORD.test(excerpt) && !EMPLOYEE_WORD.test(match[0])) {
      continue;
    }
    const min = parseCountToken(match[1] ?? "");
    const max = parseCountToken(match[2] ?? "");
    if (min == null || max == null || min > max) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min,
        max,
        display: `${min.toLocaleString("en-US")}–${max.toLocaleString("en-US")}`,
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  const atLeastRe =
    /(?:at least|more than|over|minimum of)\s+(\d{1,3}(?:,\d{3})*)(?:\s*(?:employees?|headcount|people|staff|ftes?))?/gi;
  for (const match of trimmed.matchAll(atLeastRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    if (requireEmployeeWord && !EMPLOYEE_WORD.test(excerpt) && !EMPLOYEE_WORD.test(match[0])) {
      continue;
    }
    const min = parseCountToken(match[1] ?? "");
    if (min == null) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min,
        max: null,
        display: `${min.toLocaleString("en-US")}+`,
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  const upToRe =
    /(?:up to|fewer than|less than|under|no more than)\s+(\d{1,3}(?:,\d{3})*)(?:\s*(?:employees?|headcount|people|staff|ftes?))?/gi;
  for (const match of trimmed.matchAll(upToRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    if (requireEmployeeWord && !EMPLOYEE_WORD.test(excerpt) && !EMPLOYEE_WORD.test(match[0])) {
      continue;
    }
    const max = parseCountToken(match[1] ?? "");
    if (max == null) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min: null,
        max,
        display: `up to ${max.toLocaleString("en-US")}`,
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  const singleRe =
    /(\d{1,3}(?:,\d{3})*)\+?\s*(?:employees?|headcount|people|staff|ftes?)/gi;
  for (const match of trimmed.matchAll(singleRe)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    const value = parseCountToken(match[1] ?? "");
    if (value == null) continue;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min: value,
        max: value,
        display: value.toLocaleString("en-US"),
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }

  return null;
}

function revenueMultiplier(suffix: string): number | null {
  const s = suffix.toLowerCase();
  if (s === "k") return 1_000;
  if (s === "m" || s === "million") return 1_000_000;
  if (s === "b" || s === "billion") return 1_000_000_000;
  return null;
}

function extractRevenue(text: string): HeadcountHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const re =
    /(?:\$|usd|arr|revenue|sales)\s*(\d+(?:\.\d+)?)\s*(k|m|b|million|billion)\b|(?<![A-Za-z])(\d+(?:\.\d+)?)\s*(million|billion)\b/gi;
  for (const match of trimmed.matchAll(re)) {
    const excerpt = sentenceAt(trimmed, match.index ?? 0, match[0].length);
    const amountRaw = match[1] ?? match[3];
    const suffix = match[2] ?? match[4] ?? "";
    const amount = Number(amountRaw);
    const multiplier = revenueMultiplier(suffix);
    if (!Number.isFinite(amount) || multiplier == null) continue;
    const value = amount * multiplier;
    return {
      evidence: {
        kind: NUMERIC_EVIDENCE_KIND,
        min: value,
        max: value,
        display: match[0].trim(),
      },
      excerpt,
      hedged: isHedgedResearchText(excerpt),
    };
  }
  return null;
}

function targetNeedles(criterion: CriterionSnapshot): string[] {
  const values = Array.isArray(criterion.targetValue)
    ? criterion.targetValue
    : criterion.targetValue != null
      ? [criterion.targetValue]
      : [];
  return values
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
}

function findTargetExcerpt(
  text: string,
  needles: string[],
): { excerpt: string; hedged: boolean } | null {
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  for (const needle of needles) {
    const index = lower.indexOf(needle);
    if (index < 0) continue;
    const excerpt = sentenceAt(text, index, needle.length);
    return { excerpt, hedged: isHedgedResearchText(excerpt) };
  }
  return null;
}

function joinList(values: string[] | null | undefined): string | null {
  if (!values?.length) return null;
  const joined = values.map(String).filter(Boolean).join(", ");
  return joined || null;
}

type CriterionKind =
  | "employees"
  | "revenue"
  | "industry"
  | "geography"
  | "technology"
  | "business_model"
  | "buying"
  | "risk"
  | "other";

function criterionKind(criterion: CriterionSnapshot): CriterionKind {
  const blob = `${criterion.criterionType} ${criterion.name}`.toLowerCase();
  if (/\b(employee|headcount|company size)\b/.test(blob)) return "employees";
  if (/\b(revenue|arr)\b/.test(blob)) return "revenue";
  if (/\bindustr/.test(blob)) return "industry";
  if (/\b(geograph|location)\b/.test(blob)) return "geography";
  if (/\b(technolog|tech stack|tooling)\b/.test(blob)) return "technology";
  if (/\b(business model|b2b|b2c)\b/.test(blob)) return "business_model";
  if (/\b(positive|buying signal)\b/.test(blob)) return "buying";
  if (/\b(negative|risk|disqualif)\b/.test(blob)) return "risk";
  return "other";
}

function researchField(
  research: CompanyResearchActuals | null | undefined,
  field: keyof CompanyResearchActuals,
): string | null {
  if (!research) return null;
  const raw = research[field];
  if (Array.isArray(raw)) return joinList(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function firstHeadcountFromResearch(
  research: CompanyResearchActuals | null | undefined,
): { field: string; hit: HeadcountHit } | null {
  const size = researchField(research, "companySizeContext");
  if (size) {
    const hit = extractHeadcount(size, false);
    if (hit) return { field: "companySizeContext", hit };
  }
  for (const field of ["companySummary", "whatTheySell", "businessModel"] as const) {
    const text = researchField(research, field);
    if (!text) continue;
    const hit = extractHeadcount(text, true);
    if (hit) return { field, hit };
  }
  return null;
}

function firstRevenueFromResearch(
  research: CompanyResearchActuals | null | undefined,
): { field: string; hit: HeadcountHit } | null {
  for (const field of [
    "companySizeContext",
    "companySummary",
    "whatTheySell",
    "businessModel",
  ] as const) {
    const text = researchField(research, field);
    if (!text) continue;
    const hit = extractRevenue(text);
    if (hit) return { field, hit };
  }
  return null;
}

function firstTextMatchFromResearch(
  research: CompanyResearchActuals | null | undefined,
  fields: Array<keyof CompanyResearchActuals>,
  needles: string[],
): { field: string; text: string; excerpt: string; hedged: boolean } | null {
  let hedged: { field: string; text: string; excerpt: string } | null = null;
  for (const field of fields) {
    const text = researchField(research, field);
    if (!text) continue;
    if (needles.length === 0) {
      const excerpt = text.split(/(?<=[.!?])\s+/)[0] ?? text;
      if (isHedgedResearchText(excerpt)) {
        hedged = { field, text, excerpt };
        continue;
      }
      return { field, text, excerpt, hedged: false };
    }
    const found = findTargetExcerpt(text, needles);
    if (!found) continue;
    if (found.hedged) {
      hedged = { field, text, excerpt: found.excerpt };
      continue;
    }
    return { field, text, excerpt: found.excerpt, hedged: false };
  }
  if (hedged) {
    return { ...hedged, hedged: true };
  }
  return null;
}

/**
 * Cascade for every factual criterion: list value if present, else research, else null.
 */
export function resolveCompanyActualWithProvenance(
  criterion: CriterionSnapshot,
  company: CompanyListActuals,
  research?: CompanyResearchActuals | null,
): CompanyActualResolution {
  const kind = criterionKind(criterion);
  const needles = targetNeedles(criterion);

  if (kind === "employees") {
    if (company.employeeCount != null) {
      return listResolution(
        "Employees",
        "employeeCount",
        company.employeeCount,
        String(company.employeeCount),
      );
    }
    const extracted = firstHeadcountFromResearch(research);
    if (!extracted) return unresolved();
    if (extracted.hit.hedged) {
      return hedgedResolution("Employees", extracted.field, extracted.hit.excerpt);
    }
    return researchResolution(
      "Employees",
      extracted.field,
      extracted.hit.evidence,
      extracted.hit.evidence.display,
      extracted.hit.excerpt,
    );
  }

  if (kind === "revenue") {
    if (hasListValue(company.revenue)) {
      const display = listText(company.revenue);
      return listResolution("Revenue", "revenue", company.revenue, display);
    }
    const extracted = firstRevenueFromResearch(research);
    if (!extracted) return unresolved();
    if (extracted.hit.hedged) {
      return hedgedResolution("Revenue", extracted.field, extracted.hit.excerpt);
    }
    return researchResolution(
      "Revenue",
      extracted.field,
      extracted.hit.evidence,
      extracted.hit.evidence.display,
      extracted.hit.excerpt,
    );
  }

  if (kind === "industry") {
    if (hasListValue(company.industry)) {
      return listResolution(
        "Industry",
        "industry",
        company.industry,
        listText(company.industry),
      );
    }
    const found = firstTextMatchFromResearch(
      research,
      ["businessModel", "whatTheySell", "companySummary", "primaryMarkets"],
      needles,
    );
    if (!found) return unresolved();
    if (found.hedged) {
      return hedgedResolution("Industry", found.field, found.excerpt);
    }
    return researchResolution(
      "Industry",
      found.field,
      found.text,
      found.excerpt,
      found.excerpt,
    );
  }

  if (kind === "business_model") {
    const found = firstTextMatchFromResearch(
      research,
      ["businessModel", "whatTheySell", "companySummary"],
      needles,
    );
    if (!found) return unresolved();
    if (found.hedged) {
      return hedgedResolution("Business model", found.field, found.excerpt);
    }
    return researchResolution(
      "Business model",
      found.field,
      found.text,
      found.excerpt,
      found.excerpt,
    );
  }

  if (kind === "geography") {
    if (hasListValue(company.location)) {
      return listResolution(
        "Geography",
        "location",
        company.location,
        listText(company.location),
      );
    }
    const markets = joinList(research?.primaryMarkets ?? null);
    if (!markets) return unresolved();
    if (isHedgedResearchText(markets)) {
      return hedgedResolution("Geography", "primaryMarkets", markets);
    }
    return researchResolution(
      "Geography",
      "primaryMarkets",
      markets,
      markets,
      markets,
    );
  }

  if (kind === "technology") {
    const tech = joinList(research?.relevantTechnologies ?? null);
    if (!tech) return unresolved();
    if (isHedgedResearchText(tech)) {
      return hedgedResolution("Technology", "relevantTechnologies", tech);
    }
    return researchResolution(
      "Technology",
      "relevantTechnologies",
      tech,
      tech,
      tech,
    );
  }

  if (kind === "buying") {
    const signals = joinList(research?.buyingSignals ?? null);
    if (!signals) return unresolved();
    return researchResolution(
      criterion.name,
      "buyingSignals",
      signals,
      signals,
      signals,
    );
  }

  if (kind === "risk") {
    const signals = joinList(research?.riskSignals ?? null);
    if (!signals) return unresolved();
    return researchResolution(
      criterion.name,
      "riskSignals",
      signals,
      signals,
      signals,
    );
  }

  const found = firstTextMatchFromResearch(
    research,
    [
      "companySummary",
      "whatTheySell",
      "businessModel",
      "companySizeContext",
      "relevantTechnologies",
      "primaryMarkets",
    ],
    needles,
  );
  if (!found) return unresolved();
  if (found.hedged) {
    return hedgedResolution(criterion.name, found.field, found.excerpt);
  }
  return researchResolution(
    criterion.name,
    found.field,
    found.text,
    found.excerpt,
    found.excerpt,
  );
}

export function readCriterionProvenanceLabels(assessmentData: unknown): string[] {
  if (!assessmentData || typeof assessmentData !== "object") return [];
  const rows = (assessmentData as { criterionAssessments?: unknown })
    .criterionAssessments;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const provenance = (row as { provenance?: Partial<ActualProvenance> })
        .provenance;
      if (typeof provenance?.label === "string" && provenance.label.trim()) {
        return provenance.label.trim();
      }
      return null;
    })
    .filter((label): label is string => Boolean(label));
}
