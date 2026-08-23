/**
 * ICP criterion evidence class: defaults, heuristics, labels, fingerprints, caps.
 */

export const CRITERION_EVIDENCE_CLASSES = [
  "LIST_DATA",
  "COMPANY_RESEARCH",
  "TARGETED_SEARCH",
  "SEMANTIC",
] as const;

export type CriterionEvidenceClassValue =
  (typeof CRITERION_EVIDENCE_CLASSES)[number];

export const TARGETED_SEARCH_DECISIONS = [
  "KEEP_ASYMMETRIC",
  "MAKE_SUPPORTING",
  "REMOVE",
] as const;

export type TargetedSearchDecisionValue =
  (typeof TARGETED_SEARCH_DECISIONS)[number];

/** Factual classes — AI assessment may never invent a pass/fail for these. */
export const FACTUAL_EVIDENCE_CLASSES: ReadonlySet<CriterionEvidenceClassValue> =
  new Set(["LIST_DATA", "COMPANY_RESEARCH", "TARGETED_SEARCH"]);

export function isFactualEvidenceClass(
  value: CriterionEvidenceClassValue | null | undefined,
): boolean {
  return value != null && FACTUAL_EVIDENCE_CLASSES.has(value);
}

/**
 * App-owned default. Unrecognized or missing → TARGETED_SEARCH (conservative).
 */
export function normalizeEvidenceClass(
  raw: unknown,
): CriterionEvidenceClassValue {
  if (typeof raw !== "string") return "TARGETED_SEARCH";
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((CRITERION_EVIDENCE_CLASSES as readonly string[]).includes(upper)) {
    return upper as CriterionEvidenceClassValue;
  }
  return "TARGETED_SEARCH";
}

/**
 * Heuristic for migration / legacy drafts when AI did not propose a class.
 */
export function inferEvidenceClassFromCriterion(input: {
  name: string;
  criterionType: string;
  description?: string | null;
}): CriterionEvidenceClassValue {
  const blob = [
    input.criterionType,
    input.name,
    input.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (
    /\b(industry|industries|employee|headcount|revenue|arr|geography|geographies|location|domain|company size)\b/.test(
      blob,
    )
  ) {
    return "LIST_DATA";
  }
  if (
    /\b(market|markets|what they sell|description|positioning|public signal|firmographic)\b/.test(
      blob,
    ) &&
    !/\b(salesforce|hubspot|crm|certif|building|facility|tooling|tech stack|competitor)\b/.test(
      blob,
    )
  ) {
    return "COMPANY_RESEARCH";
  }
  if (
    /\b(complex|multi-stakeholder|narrative|positioning fit|culture|maturity)\b/.test(
      blob,
    )
  ) {
    return "SEMANTIC";
  }
  if (
    /\b(salesforce|hubspot|crm|technolog|tooling|certif|building|facility|competitor|uses |stack)\b/.test(
      blob,
    )
  ) {
    return "TARGETED_SEARCH";
  }
  return "TARGETED_SEARCH";
}

export type EvidenceClassLabel = {
  class: CriterionEvidenceClassValue;
  label: string;
  tone: "neutral" | "warning";
};

export function evidenceClassAvailabilityLabel(
  evidenceClass: CriterionEvidenceClassValue,
): EvidenceClassLabel {
  switch (evidenceClass) {
    case "LIST_DATA":
      return { class: evidenceClass, label: "From your list", tone: "neutral" };
    case "COMPANY_RESEARCH":
      return {
        class: evidenceClass,
        label: "From company research",
        tone: "neutral",
      };
    case "TARGETED_SEARCH":
      return {
        class: evidenceClass,
        label: "May not be verifiable online",
        tone: "warning",
      };
    case "SEMANTIC":
      return { class: evidenceClass, label: "AI judgment", tone: "neutral" };
  }
}

export function buildEvidenceClassSummary(
  criteria: Array<{ evidenceClass: CriterionEvidenceClassValue }>,
): string {
  const total = criteria.length;
  if (total === 0) return "No criteria yet.";

  const counts: Record<CriterionEvidenceClassValue, number> = {
    LIST_DATA: 0,
    COMPANY_RESEARCH: 0,
    TARGETED_SEARCH: 0,
    SEMANTIC: 0,
  };
  for (const c of criteria) {
    counts[c.evidenceClass] += 1;
  }

  const parts: string[] = [];
  if (counts.LIST_DATA > 0) {
    parts.push(
      `${counts.LIST_DATA} of ${total} ${
        counts.LIST_DATA === 1 ? "criterion comes" : "criteria come"
      } from your list`,
    );
  }
  if (counts.COMPANY_RESEARCH > 0) {
    parts.push(
      `${counts.COMPANY_RESEARCH} from company research`,
    );
  }
  if (counts.TARGETED_SEARCH > 0) {
    parts.push(
      `${counts.TARGETED_SEARCH} may not be verifiable online`,
    );
  }
  if (counts.SEMANTIC > 0) {
    parts.push(
      `${counts.SEMANTIC} ${counts.SEMANTIC === 1 ? "needs" : "need"} AI judgment`,
    );
  }
  if (parts.length === 0) return `${total} criteria.`;
  const head = parts[0]!;
  const rest = parts.slice(1);
  if (rest.length === 0) return `${head}.`;
  return `${head}. ${rest.join(". ")}.`;
}

export const EXPECTATION_SETTING_LINE =
  "Some criteria can only be confirmed in a sales conversation. Contacts where a required criterion is unresolved will surface for review rather than being excluded.";

export const TARGETED_SEARCH_SECTION_TITLE = "May not be verifiable online";
export const TARGETED_SEARCH_SECTION_BODY =
  "These need a per-company lookup and often return nothing. Confirmed matches count in your favor. Missing evidence is never held against a company — those surface for review instead, and usually need a sales conversation to settle.";

/**
 * Fingerprint used to detect material criterion changes that invalidate approval.
 * Includes identity + evaluation shape; unrelated sortOrder / importance alone do not.
 */
export function criterionMaterialFingerprint(input: {
  name: string;
  description?: string | null;
  criterionType: string;
  evidenceClass: CriterionEvidenceClassValue;
  operator: string;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  allowedValues?: unknown;
}): string {
  const payload = {
    name: input.name.trim().toLowerCase(),
    description: (input.description ?? "").trim().toLowerCase(),
    criterionType: input.criterionType.trim().toLowerCase(),
    evidenceClass: input.evidenceClass,
    operator: input.operator,
    targetValue: input.targetValue ?? null,
    minValue: input.minValue ?? null,
    maxValue: input.maxValue ?? null,
    allowedValues: input.allowedValues ?? null,
  };
  return stableStringify(payload);
}

function stableStringify(value: unknown): string {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function isTargetedSearchDecisionStale(input: {
  decision: TargetedSearchDecisionValue | null | undefined;
  storedFingerprint: string | null | undefined;
  currentFingerprint: string;
}): boolean {
  if (!input.decision) return true;
  if (!input.storedFingerprint) return true;
  return input.storedFingerprint !== input.currentFingerprint;
}

export type CapCheckResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      exceedingNames: string[];
    };

/**
 * Enforce TARGETED_SEARCH cap. Never silently drop — name the excess criteria.
 */
export function checkTargetedSearchCap(input: {
  criteria: Array<{ name: string; evidenceClass: CriterionEvidenceClassValue }>;
  maxAllowed: number;
}): CapCheckResult {
  const targeted = input.criteria.filter(
    (c) => c.evidenceClass === "TARGETED_SEARCH",
  );
  if (targeted.length <= input.maxAllowed) return { ok: true };
  const exceeding = targeted.slice(input.maxAllowed);
  const exceedingNames = exceeding.map((c) => c.name);
  return {
    ok: false,
    exceedingNames,
    message: `This ICP has ${targeted.length} criteria that need a per-company lookup (limit ${input.maxAllowed}). Remove or reclassify: ${exceedingNames
      .map((n) => `"${n}"`)
      .join(", ")}.`,
  };
}

export function undecidedTargetedSearchCriteria<
  T extends {
    name: string;
    evidenceClass: CriterionEvidenceClassValue;
    targetedSearchDecision?: TargetedSearchDecisionValue | null;
    targetedSearchDecisionFingerprint?: string | null;
  },
>(criteria: T[]): T[] {
  return criteria.filter((c) => {
    if (c.evidenceClass !== "TARGETED_SEARCH") return false;
    const fp = criterionMaterialFingerprint({
      name: c.name,
      description: (c as { description?: string | null }).description,
      criterionType:
        (c as { criterionType?: string }).criterionType ?? c.name,
      evidenceClass: c.evidenceClass,
      operator: (c as { operator?: string }).operator ?? "",
      targetValue: (c as { targetValue?: unknown }).targetValue,
      minValue: (c as { minValue?: unknown }).minValue,
      maxValue: (c as { maxValue?: unknown }).maxValue,
      allowedValues: (c as { allowedValues?: unknown }).allowedValues,
    });
    return isTargetedSearchDecisionStale({
      decision: c.targetedSearchDecision,
      storedFingerprint: c.targetedSearchDecisionFingerprint,
      currentFingerprint: fp,
    });
  });
}
