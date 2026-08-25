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
- Ground that connection in productProblemSpace.problemsSolved and persona painPoints. Do not invent a different problem than those fields describe.
- Where the inference is uncertain, phrase it as an observation the recipient can correct, not as an assertion about their internals.
- Never state a company fact the research does not support.
- The reasoning chain is: company research → infer selling motion → identify the problem this product addresses in that motion → connect. Do not print the chain; use it to write the email.
- Name-dropping company facts reads as scraped. The email should feel written for this company, not for anyone with the same title.`;

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
 * True when the body uses customerTypes, businessModel, or primaryMarkets
 * as selling-motion evidence rather than only restating whatTheySell.
 */
export function referencesInferredSellingMotion(
  body: string,
  research: Pick<
    EmailCompanyResearch,
    "customerTypes" | "businessModel" | "primaryMarkets" | "whatTheySell"
  >,
): boolean {
  if (openingRestatesCompanyDescription(body, research)) return false;
  const bodyTokens = new Set(contentTokens(body));
  const motionTokens = [
    ...research.customerTypes,
    research.businessModel ?? "",
    ...research.primaryMarkets,
  ].flatMap((value) => contentTokens(value));
  return motionTokens.some((token) => bodyTokens.has(token));
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
      reasonTowardProductProblems: input.problemSpace.problemsSolved,
      connectToPersonaPains: input.problemSpace.painPoints,
      ifUncertain:
        "phrase the motion as an observation the recipient can correct",
    },
    null,
    2,
  );
}
