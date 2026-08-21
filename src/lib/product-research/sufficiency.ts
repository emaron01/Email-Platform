/**
 * Deterministic Product evidence sufficiency for progressive web search.
 * Pricing/AOV alone never forces more searching.
 */

export type ProductEvidenceDimensions = {
  whatProductDoes: boolean;
  problemsSolved: boolean;
  capabilities: boolean;
  valueProposition: boolean;
  buyerFunctions: boolean;
  differentiators: boolean;
  pricing: boolean;
  proofPoints: boolean;
};

export type ProductSufficiencyResult = {
  sufficient: boolean;
  dimensions: ProductEvidenceDimensions;
  missingPrimary: Array<keyof ProductEvidenceDimensions>;
  missingSecondary: Array<keyof ProductEvidenceDimensions>;
  combinedTextLength: number;
};

const PRIMARY: Array<keyof ProductEvidenceDimensions> = [
  "whatProductDoes",
  "problemsSolved",
  "capabilities",
  "valueProposition",
  "buyerFunctions",
];

const SECONDARY: Array<keyof ProductEvidenceDimensions> = [
  "differentiators",
  "proofPoints",
  "pricing", // never required for sufficiency / never forces search alone
];

function hasSignal(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Heuristic scan of acquired evidence text (user + discovered).
 */
export function evaluateProductEvidenceSufficiency(input: {
  excerpts: Array<{ text: string; sourceType?: string }>;
  productName: string;
}): ProductSufficiencyResult {
  const combined = input.excerpts
    .map((e) => e.text)
    .join("\n")
    .toLowerCase();
  const len = combined.length;

  const dims: ProductEvidenceDimensions = {
    whatProductDoes:
      len >= 400 ||
      hasSignal(combined, [
        /\b(platform|software|solution|product|service|helps|enables)\b/,
      ]),
    problemsSolved: hasSignal(combined, [
      /\b(problems?|pains?|challenges?|struggles?|inefficien\w*|manual|reduce|eliminates?)\b/,
    ]),
    capabilities: hasSignal(combined, [
      /\b(features?|capabilit\w*|automat\w*|integrat\w*|analy\w*|forecasts?|workflows?|dashboards?)\b/,
    ]),
    valueProposition:
      hasSignal(combined, [
        /\b(value|benefit|outcome|roi|improve|increase|save|confidence)\b/,
      ]) || len >= 800,
    buyerFunctions: hasSignal(combined, [
      /\b(cro|ceo|vp|director|manager|sales|marketing|ops|finance|buyers?|personas?|roles?)\b/,
    ]),
    differentiators: hasSignal(combined, [
      /\b(unlike|different|unique|only|vs\.|versus|competitive)\b/,
    ]),
    pricing: hasSignal(combined, [
      /\b(pricing|price|plan|subscription|per seat|aov|\$)\b/,
    ]),
    proofPoints: hasSignal(combined, [
      /\b(customer|case study|testimonial|trusted by|logo|gartner|forrester)\b/,
    ]),
  };

  // Very short evidence cannot be sufficient even if keyword hits fire.
  if (len < 200) {
    for (const k of PRIMARY) dims[k] = false;
  }

  const missingPrimary = PRIMARY.filter((k) => !dims[k]);
  const missingSecondary = SECONDARY.filter(
    (k) => k !== "pricing" && !dims[k],
  );

  const sufficient =
    missingPrimary.length === 0 &&
    len >= 600 &&
    input.excerpts.length >= 1;

  return {
    sufficient,
    dimensions: dims,
    missingPrimary,
    missingSecondary,
    combinedTextLength: len,
  };
}

export function buildProductSearchFocus(
  productName: string,
  domain: string | null,
  missingPrimary: Array<keyof ProductEvidenceDimensions>,
  missingSecondary: Array<keyof ProductEvidenceDimensions>,
): string {
  const targets = [...missingPrimary, ...missingSecondary].filter(
    (k) => k !== "pricing",
  );
  const identity = domain
    ? `"${productName}" OR site:${domain}`
    : `"${productName}"`;

  if (targets.length === 0) {
    return `${identity} official product overview capabilities customers`;
  }

  const labels: Record<keyof ProductEvidenceDimensions, string> = {
    whatProductDoes: "product overview what it does",
    problemsSolved: "problems solved use cases",
    capabilities: "product capabilities features",
    valueProposition: "value proposition business outcomes",
    buyerFunctions: "buyers personas who uses customers",
    differentiators: "differentiators vs competitors",
    pricing: "pricing plans",
    proofPoints: "case studies customers proof",
  };

  const focus = targets.map((t) => labels[t]).join("; ");
  return `${identity} ${focus}. Prefer official product pages and documentation.`;
}
