/**
 * How company research is used in outbound email: infer selling motion,
 * then connect it to this product's problem space. Domain content comes
 * from runtime product and research fields, never from this module.
 */

export type EmailCompanyResearch = {
  companySummary: string | null;
  whatTheySell: string | null;
  customerTypes: string[];
  primaryMarkets: string[];
  businessModel: string | null;
  companySizeContext: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
};

export type ProductProblemSpace = {
  problemsSolved: string[];
  painPoints: string[];
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "for",
  "from",
  "i",
  "in",
  "is",
  "of",
  "on",
  "or",
  "see",
  "that",
  "the",
  "their",
  "they",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

export const COMPANY_RESEARCH_USE_INSTRUCTIONS = `How to use company research (when supplied):
- Do NOT restate what the company does. The recipient already knows.
- DO infer their selling motion from customerTypes, businessModel, whatTheySell, and primaryMarkets, and reference that motion rather than the company description.
- Infer motion characteristics such as deal complexity, cycle length, stakeholder count, buying centers, and customer type, then connect that motion to the problem this product addresses for this persona.
- Ground that connection in persona painPoints first; use productProblemSpace.problemsSolved only when it aligns with that persona pain. Do not invent a different problem than those fields describe.
- Where the inference is uncertain, phrase it as an observation the recipient can correct, not as an assertion about their internals.
- Never state a company fact the research does not support.
- The reasoning chain is: company research → infer selling motion → identify the problem this product addresses in that motion → connect. Do not print the chain; use it to write the email.
- Name-dropping company facts reads as scraped. The email should feel written for this company, not for anyone with the same title.
- Do not open by leaning on vocabulary drawn from the contact's title. Title identifies the recipient; it is not selling-motion evidence. Prefer research-derived motion details that are not shared with the title.`;

export function contentTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function firstContentSentence(body: string): string {
  const withoutGreeting = body
    .replace(
      /^(?:hi|hello|hey|good morning|good afternoon|good evening)\b[^,\n]{0,60},?\s*/i,
      "",
    )
    .trim();
  return (
    withoutGreeting
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .find(Boolean) ?? ""
  );
}

/**
 * True when the opening restates company description / what they sell
 * instead of inferring selling motion.
 */
export function openingRestatesCompanyDescription(
  body: string,
  research: {
    companySummary?: string | null;
    whatTheySell?: string | null;
  },
): boolean {
  const opening = firstContentSentence(body);
  if (!opening) return false;
  if (
    /\bi see\b/i.test(opening) ||
    /\byou (?:sell|provide|offer)\b/i.test(opening) ||
    /\byour company (?:sells?|provides?|offers?)\b/i.test(opening)
  ) {
    return true;
  }

  const openingTokens = new Set(contentTokens(opening));
  if (openingTokens.size === 0) return false;
  for (const source of [research.whatTheySell, research.companySummary]) {
    if (!source?.trim()) continue;
    const sourceTokens = contentTokens(source);
    if (sourceTokens.length < 3) continue;
    const overlap = sourceTokens.filter((token) => openingTokens.has(token));
    if (overlap.length / sourceTokens.length >= 0.5) return true;
  }
  return false;
}

/**
 * Tokens that appear in both the contact title and company research fields.
 * Shared title/research vocabulary is not selling-motion evidence — an opener
 * that only leans on the title can otherwise falsely pass motion checks.
 */
export function titleResearchOverlapTokens(
  title: string | null | undefined,
  research: Pick<
    EmailCompanyResearch,
    | "customerTypes"
    | "businessModel"
    | "primaryMarkets"
    | "whatTheySell"
    | "companySummary"
  >,
): Set<string> {
  const titleTokenSet = new Set(contentTokens(title ?? ""));
  if (titleTokenSet.size === 0) return new Set();
  const researchTokenSet = new Set(
    [
      ...research.customerTypes,
      research.businessModel ?? "",
      ...research.primaryMarkets,
      research.whatTheySell ?? "",
      research.companySummary ?? "",
    ].flatMap((value) => contentTokens(value)),
  );
  const overlap = new Set<string>();
  for (const token of titleTokenSet) {
    if (researchTokenSet.has(token)) overlap.add(token);
  }
  return overlap;
}

/**
 * Selling-motion tokens from research, excluding title vocabulary.
 * When a research phrase is mostly title tokens (e.g. title "VP of Carrier
 * Network Operations" vs customerType "carrier network operations teams"),
 * the whole phrase is dropped so residual words like "teams" cannot pass a
 * title-only opener.
 */
export function distinctiveMotionTokens(
  research: Pick<
    EmailCompanyResearch,
    "customerTypes" | "businessModel" | "primaryMarkets"
  >,
  contactTitle?: string | null,
): string[] {
  const titleTokenSet = new Set(contentTokens(contactTitle ?? ""));
  const fieldValues = [
    ...research.customerTypes,
    research.businessModel ?? "",
    ...research.primaryMarkets,
  ];
  const evidence: string[] = [];
  for (const value of fieldValues) {
    const tokens = contentTokens(value);
    if (tokens.length === 0) continue;
    if (titleTokenSet.size > 0) {
      const overlapCount = tokens.filter((token) =>
        titleTokenSet.has(token),
      ).length;
      if (tokens.length >= 2 && overlapCount / tokens.length >= 0.5) {
        continue;
      }
    }
    for (const token of tokens) {
      if (!titleTokenSet.has(token)) evidence.push(token);
    }
  }
  return evidence;
}

/**
 * True when the opening leans on title vocabulary that also appears in
 * research, without distinctive non-title motion evidence in the opener.
 */
export function openingLeansOnTitleVocabulary(
  body: string,
  title: string | null | undefined,
  research: Pick<
    EmailCompanyResearch,
    | "customerTypes"
    | "businessModel"
    | "primaryMarkets"
    | "whatTheySell"
    | "companySummary"
  >,
): boolean {
  const opening = firstContentSentence(body);
  if (!opening) return false;
  const overlap = titleResearchOverlapTokens(title, research);
  if (overlap.size === 0) return false;
  const openingTokenSet = new Set(contentTokens(opening));
  const titleOverlapInOpening = [...overlap].filter((token) =>
    openingTokenSet.has(token),
  );
  if (titleOverlapInOpening.length === 0) return false;
  const distinctiveInOpening = distinctiveMotionTokens(research, title).filter(
    (token) => openingTokenSet.has(token),
  );
  return distinctiveInOpening.length === 0;
}

/**
 * True when the body uses customerTypes, businessModel, or primaryMarkets
 * as selling-motion evidence rather than only restating whatTheySell.
 * Tokens shared with the contact title (and research phrases dominated by
 * title vocabulary) do not count as motion evidence.
 */
export function referencesInferredSellingMotion(
  body: string,
  research: Pick<
    EmailCompanyResearch,
    | "customerTypes"
    | "businessModel"
    | "primaryMarkets"
    | "whatTheySell"
    | "companySummary"
  >,
  contactTitle?: string | null,
): boolean {
  if (openingRestatesCompanyDescription(body, research)) return false;
  if (openingLeansOnTitleVocabulary(body, contactTitle, research)) return false;
  const bodyTokens = new Set(contentTokens(body));
  return distinctiveMotionTokens(research, contactTitle).some((token) =>
    bodyTokens.has(token),
  );
}

export function buildRuntimeReasoningSketch(input: {
  research: EmailCompanyResearch | null;
  problemSpace: ProductProblemSpace;
}): string | null {
  if (!input.research) return null;
  return JSON.stringify(
    {
      purpose:
        "Pattern for this recipient only. Do not copy these strings into the email.",
      supportedSignals: {
        customerTypes: input.research.customerTypes,
        businessModel: input.research.businessModel,
        primaryMarkets: input.research.primaryMarkets,
        whatTheySell: input.research.whatTheySell,
      },
      inferSellingMotionFrom:
        "the supportedSignals above (deal complexity, cycle length, stakeholder count, buying centers, customer type)",
      doNotOpenWith: "a restatement of whatTheySell or companySummary",
      reasonTowardPersonaPains: input.problemSpace.painPoints,
      productProblemsWhenAligned: input.problemSpace.problemsSolved,
      ifUncertain:
        "phrase the motion as an observation the recipient can correct",
    },
    null,
    2,
  );
}
