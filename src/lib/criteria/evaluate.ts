/**
 * Deterministic criterion evaluation — prefer over AI when values are known.
 * UNKNOWN when evidence is missing (never fabricate; never auto-NO_FIT).
 */

import type {
  CriterionOperatorValue,
  CriterionSnapshot,
} from "@/lib/criteria/types";

export type CriterionEvalResult = {
  assessment: "STRONG" | "MODERATE" | "WEAK" | "NO_FIT" | "UNKNOWN";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  method: "DETERMINISTIC" | "REQUIRES_AI" | "UNKNOWN";
  reasoning: string;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const cleaned = value.replace(/[$,%\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(v)) return true;
    if (["false", "no", "0"].includes(v)) return false;
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s || null;
}

function compare(
  operator: CriterionOperatorValue,
  actual: number,
  target: number | null,
  min: number | null,
  max: number | null,
): boolean | null {
  switch (operator) {
    case "EQUALS":
      return target == null ? null : actual === target;
    case "NOT_EQUALS":
      return target == null ? null : actual !== target;
    case "GREATER_THAN":
      return target == null ? null : actual > target;
    case "GREATER_THAN_OR_EQUAL":
      return target == null ? null : actual >= target;
    case "LESS_THAN":
      return target == null ? null : actual < target;
    case "LESS_THAN_OR_EQUAL":
      return target == null ? null : actual <= target;
    case "BETWEEN":
      if (min == null || max == null) return null;
      return actual >= min && actual <= max;
    default:
      return null;
  }
}

/**
 * Evaluate a criterion against a known actual value.
 * Returns REQUIRES_AI for semantic TEXT / role criteria that cannot be decided numerically.
 */
export function evaluateCriterionDeterministic(input: {
  criterion: CriterionSnapshot;
  actualValue: unknown;
}): CriterionEvalResult {
  const { criterion, actualValue } = input;

  if (actualValue == null || actualValue === "") {
    return {
      assessment: "UNKNOWN",
      confidence: "LOW",
      method: "UNKNOWN",
      reasoning: `No evidence for "${criterion.name}".`,
    };
  }

  if (
    criterion.dataType === "NUMBER" ||
    criterion.dataType === "CURRENCY"
  ) {
    const actual = toNumber(actualValue);
    const target = toNumber(criterion.targetValue);
    const min = toNumber(criterion.minValue);
    const max = toNumber(criterion.maxValue);
    if (actual == null) {
      return {
        assessment: "UNKNOWN",
        confidence: "LOW",
        method: "UNKNOWN",
        reasoning: `Could not parse numeric evidence for "${criterion.name}".`,
      };
    }
    const ok = compare(criterion.operator, actual, target, min, max);
    if (ok == null) {
      return {
        assessment: "UNKNOWN",
        confidence: "LOW",
        method: "REQUIRES_AI",
        reasoning: `Operator ${criterion.operator} not deterministically applicable.`,
      };
    }
    if (ok) {
      return {
        assessment: criterion.isRequired ? "STRONG" : "MODERATE",
        confidence: "HIGH",
        method: "DETERMINISTIC",
        reasoning: `Observed ${actual} satisfies ${criterion.name}.`,
      };
    }
    return {
      assessment: criterion.isDisqualifier ? "NO_FIT" : "NO_FIT",
      confidence: "HIGH",
      method: "DETERMINISTIC",
      reasoning: `Observed ${actual} does not satisfy ${criterion.name}.`,
    };
  }

  if (criterion.dataType === "BOOLEAN") {
    const actual = toBoolean(actualValue);
    const target = toBoolean(criterion.targetValue) ?? true;
    if (actual == null) {
      return {
        assessment: "UNKNOWN",
        confidence: "LOW",
        method: "UNKNOWN",
        reasoning: `Boolean evidence missing for "${criterion.name}".`,
      };
    }
    const ok =
      criterion.operator === "NOT_EQUALS" ? actual !== target : actual === target;
    return {
      assessment: ok ? "STRONG" : "NO_FIT",
      confidence: "HIGH",
      method: "DETERMINISTIC",
      reasoning: ok
        ? `Boolean criterion "${criterion.name}" matched.`
        : `Boolean criterion "${criterion.name}" did not match.`,
    };
  }

  if (
    criterion.dataType === "ENUM" ||
    criterion.dataType === "MULTI_SELECT" ||
    criterion.dataType === "TEXT"
  ) {
    // Simple exact/contains matching when target is explicit; else AI.
    const actual = normalizeText(actualValue);
    if (!actual) {
      return {
        assessment: "UNKNOWN",
        confidence: "LOW",
        method: "UNKNOWN",
        reasoning: `Text evidence missing for "${criterion.name}".`,
      };
    }

    if (criterion.operator === "CONTAINS") {
      const needle = normalizeText(criterion.targetValue);
      if (!needle) {
        return {
          assessment: "UNKNOWN",
          confidence: "LOW",
          method: "REQUIRES_AI",
          reasoning: "Semantic text match required.",
        };
      }
      const ok = actual.includes(needle);
      return {
        assessment: ok ? "STRONG" : "WEAK",
        confidence: "MEDIUM",
        method: "DETERMINISTIC",
        reasoning: ok
          ? `Text contains expected value for "${criterion.name}".`
          : `Text does not contain expected value for "${criterion.name}".`,
      };
    }

    if (criterion.operator === "IN" || criterion.operator === "EQUALS") {
      const targets = Array.isArray(criterion.targetValue)
        ? criterion.targetValue.map(normalizeText).filter(Boolean)
        : [normalizeText(criterion.targetValue)];
      const ok = targets.some((t) => t && (actual === t || actual.includes(t)));
      if (targets.filter(Boolean).length === 0) {
        return {
          assessment: "UNKNOWN",
          confidence: "LOW",
          method: "REQUIRES_AI",
          reasoning: "Semantic interpretation required.",
        };
      }
      return {
        assessment: ok ? "STRONG" : "WEAK",
        confidence: "MEDIUM",
        method: "DETERMINISTIC",
        reasoning: ok
          ? `Matched allowed values for "${criterion.name}".`
          : `Did not match allowed values for "${criterion.name}".`,
      };
    }
  }

  return {
    assessment: "UNKNOWN",
    confidence: "LOW",
    method: "REQUIRES_AI",
    reasoning: `Semantic evaluation required for "${criterion.name}".`,
  };
}

/**
 * Map known company firmographics onto common criterion types for deterministic scoring.
 */
export function resolveCompanyActualForCriterion(
  criterion: CriterionSnapshot,
  company: {
    industry?: string | null;
    employeeCount?: number | null;
    revenue?: { toString(): string } | number | string | null;
    location?: string | null;
  },
  research?: {
    relevantTechnologies?: string[] | null;
    buyingSignals?: string[] | null;
    riskSignals?: string[] | null;
    primaryMarkets?: string[] | null;
  } | null,
): unknown {
  const type = criterion.criterionType.toLowerCase();
  const name = criterion.name.toLowerCase();

  if (type.includes("employee") || name.includes("employee")) {
    return company.employeeCount ?? null;
  }
  if (type.includes("revenue") || name.includes("revenue")) {
    return company.revenue?.toString?.() ?? company.revenue ?? null;
  }
  if (type.includes("industry") || name.includes("industry")) {
    return company.industry ?? null;
  }
  if (
    type.includes("geography") ||
    type.includes("location") ||
    name.includes("geography") ||
    name.includes("location")
  ) {
    return company.location ?? research?.primaryMarkets?.join(", ") ?? null;
  }
  if (type.includes("technolog") || name.includes("technolog")) {
    return research?.relevantTechnologies?.join(", ") ?? null;
  }
  if (type.includes("positive") || name.includes("buying signal")) {
    return research?.buyingSignals?.join(", ") ?? null;
  }
  if (type.includes("negative") || name.includes("risk") || name.includes("disqualif")) {
    return research?.riskSignals?.join(", ") ?? null;
  }
  // Dynamic attributes (buildings owned, fleet size, etc.) — unknown without research evidence.
  return null;
}
