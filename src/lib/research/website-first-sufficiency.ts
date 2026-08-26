/**
 * Website-first sufficiency: decide whether first-party site evidence alone
 * is enough to skip a costly web_search stage.
 *
 * Strict by design — a wrong "sufficient" yields thin/hallucinated research.
 * Thin splash pages and ungrounded field fills must still trigger search.
 */

import type { ResearchSource } from "@/lib/research/types";
import {
  evaluateEvidenceSufficiency,
  type EvidenceDimensions,
  type SufficiencyResult,
} from "@/lib/research/sufficiency";

/** Minimum first-party excerpt length before website-only research can pass. */
export const WEBSITE_FIRST_MIN_EXCERPT_CHARS = 1200;

/**
 * At least this many primary dimensions must be cited on COMPANY_WEBSITE
 * supports (not merely filled in the structured result).
 */
export const WEBSITE_FIRST_MIN_SUPPORTED_PRIMARIES = 3;

const PRIMARY_SUPPORT_ALIASES: Record<
  Exclude<
    keyof EvidenceDimensions,
    | "primaryMarkets"
    | "relevantTechnologies"
    | "buyingSignals"
    | "riskSignals"
    | "estimatedAov"
  >,
  string[]
> = {
  companyIdentity: [
    "companyidentity",
    "companysummary",
    "identity",
    "summary",
  ],
  whatTheySell: ["whattheysell", "products", "services", "offering"],
  customerTypes: ["customertypes", "customers", "segments", "buyers"],
  businessModel: ["businessmodel", "pricingmodel", "monetization"],
  companySizeContext: [
    "companysizecontext",
    "companysize",
    "employees",
    "headcount",
    "scale",
  ],
};

function normalizedSupportToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function primaryDimsSupportedByWebsite(
  sources: ResearchSource[],
): Array<keyof typeof PRIMARY_SUPPORT_ALIASES> {
  const websiteSupports = sources
    .filter((source) => source.sourceType === "COMPANY_WEBSITE")
    .flatMap((source) => source.supports)
    .map(normalizedSupportToken)
    .filter(Boolean);
  if (websiteSupports.length === 0) return [];

  const hit: Array<keyof typeof PRIMARY_SUPPORT_ALIASES> = [];
  for (const [dim, aliases] of Object.entries(PRIMARY_SUPPORT_ALIASES) as Array<
    [keyof typeof PRIMARY_SUPPORT_ALIASES, string[]]
  >) {
    if (
      aliases.some((alias) =>
        websiteSupports.some(
          (token) => token.includes(alias) || alias.includes(token),
        ),
      )
    ) {
      hit.push(dim);
    }
  }
  return hit;
}

export type WebsiteFirstSufficiencyInput = {
  websiteExcerptText: string;
  sources: ResearchSource[];
  fields: {
    companySummary?: string | null;
    whatTheySell?: string | null;
    customerTypes?: string[] | null;
    businessModel?: string | null;
    companySizeContext?: string | null;
    primaryMarkets?: string[] | null;
    relevantTechnologies?: string[] | null;
    buyingSignals?: string[] | null;
    riskSignals?: string[] | null;
    estimatedAov?: string | null;
  };
};

export type WebsiteFirstSufficiencyResult = SufficiencyResult & {
  websiteExcerptChars: number;
  supportedPrimaryCount: number;
  hasCompanyWebsiteSource: boolean;
  failReasons: string[];
};

/**
 * Strict gate used after the website-only synthesis stage.
 *
 * Must pass all of:
 * 1. First-party excerpt >= WEBSITE_FIRST_MIN_EXCERPT_CHARS (real page body)
 * 2. All primary dimension fields filled (requiredMet from base sufficiency)
 * 3. A COMPANY_WEBSITE source is present
 * 4. >= WEBSITE_FIRST_MIN_SUPPORTED_PRIMARIES primary dims cited on that site
 *
 * Intentionally does NOT use base.sufficient's multi-source quality floor —
 * a single official site is the entire evidence set in stage 1.
export function evaluateWebsiteFirstSufficiency(
  input: WebsiteFirstSufficiencyInput,
): WebsiteFirstSufficiencyResult {
  const excerpt = input.websiteExcerptText.trim();
  const base = evaluateEvidenceSufficiency({
    sources: input.sources,
    fields: input.fields,
    maxSourcesPerCompany: Math.max(1, input.sources.length),
  });
  const supportedPrimaries = primaryDimsSupportedByWebsite(input.sources);
  const hasCompanyWebsiteSource = input.sources.some(
    (source) => source.sourceType === "COMPANY_WEBSITE",
  );
  const failReasons: string[] = [];

  if (excerpt.length < WEBSITE_FIRST_MIN_EXCERPT_CHARS) {
    failReasons.push(
      `website excerpt too short (${excerpt.length} < ${WEBSITE_FIRST_MIN_EXCERPT_CHARS})`,
    );
  }
  if (!base.requiredMet) {
    failReasons.push(
      `missing primary fields: ${base.missingPrimary.join(", ") || "unknown"}`,
    );
  }
  if (!hasCompanyWebsiteSource) {
    failReasons.push("no COMPANY_WEBSITE source in result");
  }
  if (supportedPrimaries.length < WEBSITE_FIRST_MIN_SUPPORTED_PRIMARIES) {
    failReasons.push(
      `website supports only ${supportedPrimaries.length} primary dims (need ${WEBSITE_FIRST_MIN_SUPPORTED_PRIMARIES})`,
    );
  }
  // Do not reuse base.sufficient's multi-source quality floor — a single
  // official site is the entire evidence set in this stage.

  return {
    ...base,
    sufficient: failReasons.length === 0,
    websiteExcerptChars: excerpt.length,
    supportedPrimaryCount: supportedPrimaries.length,
    hasCompanyWebsiteSource,
    failReasons,
  };
}
