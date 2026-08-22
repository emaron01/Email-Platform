/**
 * Deterministic Persona evidence sufficiency (before progressive web search).
 */

export type PersonaEvidenceDimension =
  | "role_function"
  | "scope_of_ownership"
  | "primary_responsibilities"
  | "relevant_kpis"
  | "product_relevant_problems"
  | "desired_outcomes"
  | "organizational_pressures"
  | "buying_influence"
  | "role_signals"
  | "role_ambiguity"
  | "product_relevance";

export type PersonaSufficiencyResult = {
  sufficient: boolean;
  missingDimensions: PersonaEvidenceDimension[];
  ambiguityLevel: "LOW" | "MEDIUM" | "HIGH";
  combinedTextLength: number;
};

const AMBIGUOUS_ROLE_PATTERNS =
  /\b(infrastructure|operations|platform|systems|digital|transformation|enablement|specialist|manager|director|vp)\b/i;

export function evaluatePersonaEvidenceSufficiency(input: {
  roleName: string;
  productName: string;
  productEvidenceText: string;
  personaMaterialText: string;
  webEvidenceText: string;
}): PersonaSufficiencyResult {
  const combined = [
    input.roleName,
    input.productName,
    input.productEvidenceText,
    input.personaMaterialText,
    input.webEvidenceText,
  ]
    .join("\n")
    .toLowerCase();
  const len = combined.length;

  const has = (re: RegExp) => re.test(combined);

  const dims: Record<PersonaEvidenceDimension, boolean> = {
    role_function:
      Boolean(input.roleName.trim()) &&
      has(/\b(sales|revenue|marketing|ops|finance|it|security|engineering|cro|ceo|vp)\b/),
    scope_of_ownership: has(
      /\b(owns|ownership|accountable|responsible for|scope)\b/,
    ),
    primary_responsibilities: has(
      /\b(responsibilit|duties|mandate|charter|job)\b/,
    ),
    relevant_kpis: has(/\b(kpi|metric|quota|forecast|sla|nrr|arr|pipeline)\b/),
    product_relevant_problems: has(
      /\b(problem|pain|challenge|inefficien|manual|risk)\b/,
    ),
    desired_outcomes: has(
      /\b(outcome|improve|reduce|increase|confidence|accuracy|save)\b/,
    ),
    organizational_pressures: has(
      /\b(pressure|board|quota|board|exec|urgency|compliance)\b/,
    ),
    buying_influence: has(
      /\b(buyer|champion|influencer|decision|budget|procure|stakeholder)\b/,
    ),
    role_signals: has(/\b(signal|title|senior|c-suite|director|manager)\b/),
    role_ambiguity: !AMBIGUOUS_ROLE_PATTERNS.test(input.roleName) || len > 1200,
    product_relevance:
      has(new RegExp(input.productName.toLowerCase().slice(0, 24))) ||
      has(/\b(product|solution|platform|software)\b/),
  };

  const primary: PersonaEvidenceDimension[] = [
    "role_function",
    "primary_responsibilities",
    "product_relevant_problems",
    "desired_outcomes",
    "product_relevance",
  ];

  const missingDimensions = (
    Object.entries(dims) as Array<[PersonaEvidenceDimension, boolean]>
  )
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  const missingPrimary = primary.filter((d) => !dims[d]);

  const ambiguousTitle = AMBIGUOUS_ROLE_PATTERNS.test(input.roleName);
  const ambiguityLevel: PersonaSufficiencyResult["ambiguityLevel"] =
    ambiguousTitle && missingDimensions.includes("scope_of_ownership")
      ? "HIGH"
      : ambiguousTitle || missingPrimary.length >= 2
        ? "MEDIUM"
        : "LOW";

  // Strong product+role context can skip search for well-known roles (e.g. CRO).
  const wellKnown =
    /\b(cro|chief revenue|vp sales|revops|revenue operations)\b/i.test(
      input.roleName,
    ) && len >= 400;

  const sufficient =
    (missingPrimary.length === 0 && len >= 500) ||
    (wellKnown && missingPrimary.length <= 1);

  return {
    sufficient,
    missingDimensions,
    ambiguityLevel,
    combinedTextLength: len,
  };
}

export function buildPersonaSearchFocus(input: {
  roleName: string;
  productName: string;
  industryHint: string | null;
  missing: PersonaEvidenceDimension[];
}): string {
  const ctx = input.industryHint
    ? `${input.roleName} ${input.industryHint}`
    : input.roleName;
  const targets = input.missing.filter((d) => d !== "role_ambiguity");
  if (targets.length === 0) {
    return `"${ctx}" responsibilities ownership KPIs relative to ${input.productName}`;
  }
  const labels: Record<PersonaEvidenceDimension, string> = {
    role_function: "role function and org placement",
    scope_of_ownership: "scope of ownership",
    primary_responsibilities: "primary responsibilities",
    relevant_kpis: "KPIs and accountabilities",
    product_relevant_problems: "problems and pains",
    desired_outcomes: "desired business outcomes",
    organizational_pressures: "organizational pressures",
    buying_influence: "buying role and decision influence",
    role_signals: "role signals and titles",
    role_ambiguity: "role disambiguation",
    product_relevance: `relevance to ${input.productName}`,
  };
  return `"${ctx}" ${targets.map((t) => labels[t]).join("; ")}. Prefer authoritative role documentation.`;
}
