/**
 * Deterministic criterion evaluation — prefer over AI when values are known.
 * UNKNOWN when evidence is missing (never fabricate; never auto-NO_FIT).
 */

import type {
  CriterionOperatorValue,
  CriterionSnapshot,
} from "@/lib/criteria/types";
import { isNumericEvidence } from "@/lib/criteria/research-cascade";

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

function toTime(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? null : asDate.getTime();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }
  return null;
}

function stringifyConstraintBound(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function listConstraintTargets(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value != null ? [value] : [];
  return values
    .map((entry) => stringifyConstraintBound(entry))
    .filter((entry): entry is string => Boolean(entry));
}

/** Generic miss phrase from operator + targets. No field names or units. */
export function describeConstraintMiss(input: {
  operator: string;
  minValue?: unknown;
  maxValue?: unknown;
  targetValue?: unknown;
}): string | null {
  const operator = input.operator.trim().toUpperCase();
  if (operator === "BETWEEN") {
    const min = stringifyConstraintBound(input.minValue);
    const max = stringifyConstraintBound(input.maxValue);
    if (min && max) return `outside ${min}–${max}`;
  }
  const targets = listConstraintTargets(input.targetValue);
  if (
    (operator === "IN" || operator === "EQUALS" || operator === "CONTAINS") &&
    targets.length > 0
  ) {
    return `not matching ${targets.join(", ")}`;
  }
  if (
    (operator === "NOT_IN" || operator === "NOT_EQUALS") &&
    targets.length > 0
  ) {
    return `matching excluded ${targets.join(", ")}`;
  }
  if (
    operator === "GREATER_THAN" ||
    operator === "GREATER_THAN_OR_EQUAL" ||
    operator === "LESS_THAN" ||
    operator === "LESS_THAN_OR_EQUAL"
  ) {
    const target = stringifyConstraintBound(input.targetValue);
    if (target) return `outside ${target}`;
  }
  return null;
}

export function formatConfirmedFactualMiss(input: {
  name: string;
  observed: string;
  operator: string;
  minValue?: unknown;
  maxValue?: unknown;
  targetValue?: unknown;
}): string {
  const observed = input.observed.trim();
  const miss = describeConstraintMiss(input);
  if (!observed) {
    return miss ? `${input.name} (${miss})` : input.name;
  }
  return miss
    ? `${input.name}: ${observed} (${miss})`
    : `${input.name}: ${observed}`;
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

function numericBounds(value: unknown): { min: number | null; max: number | null; display: string } | null {
  if (isNumericEvidence(value)) {
    return { min: value.min, max: value.max, display: value.display };
  }
  const n = toNumber(value);
  if (n == null) return null;
  return { min: n, max: n, display: String(n) };
}

/**
 * Evaluate a point or a research-extracted range. Mixed bounds (overlap) → UNKNOWN.
 * Min-only / max-only claims only resolve when every possible value in that bound
 * would give the same answer.
 */
export function compareNumericBounds(
  operator: CriterionOperatorValue,
  bounds: { min: number | null; max: number | null },
  target: number | null,
  min: number | null,
  max: number | null,
): boolean | null {
  const point = (n: number) => compare(operator, n, target, min, max);

  if (bounds.min != null && bounds.max != null) {
    const low = point(bounds.min);
    const high = point(bounds.max);
    if (low == null || high == null) return null;
    if (low === high) return low;
    return null;
  }

  if (bounds.min != null) {
    const atMin = point(bounds.min);
    if (atMin == null) return null;
    switch (operator) {
      case "GREATER_THAN":
      case "GREATER_THAN_OR_EQUAL":
        return atMin ? true : null;
      case "LESS_THAN":
      case "LESS_THAN_OR_EQUAL":
        return atMin ? null : false;
      case "BETWEEN":
        return min != null && bounds.min > (max ?? min) ? false : null;
      default:
        return null;
    }
  }

  if (bounds.max != null) {
    const atMax = point(bounds.max);
    if (atMax == null) return null;
    switch (operator) {
      case "LESS_THAN":
      case "LESS_THAN_OR_EQUAL":
        return atMax ? true : null;
      case "GREATER_THAN":
      case "GREATER_THAN_OR_EQUAL":
        return atMax ? null : false;
      case "BETWEEN":
        return max != null && bounds.max < (min ?? max) ? false : null;
      default:
        return null;
    }
  }

  return null;
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
    criterion.dataType === "CURRENCY" ||
    criterion.dataType === "DATE"
  ) {
    const bounds =
      criterion.dataType === "DATE"
        ? (() => {
            const t = toTime(actualValue);
            if (t == null) return null;
            return { min: t, max: t, display: stringifyConstraintBound(actualValue) ?? String(t) };
          })()
        : numericBounds(actualValue);
    const target =
      criterion.dataType === "DATE"
        ? toTime(criterion.targetValue)
        : toNumber(criterion.targetValue);
    const min =
      criterion.dataType === "DATE"
        ? toTime(criterion.minValue)
        : toNumber(criterion.minValue);
    const max =
      criterion.dataType === "DATE"
        ? toTime(criterion.maxValue)
        : toNumber(criterion.maxValue);
    if (bounds == null) {
      return {
        assessment: "UNKNOWN",
        confidence: "LOW",
        method: "UNKNOWN",
        reasoning: `Could not parse evidence for "${criterion.name}".`,
      };
    }
    const ok = compareNumericBounds(
      criterion.operator,
      bounds,
      target,
      min,
      max,
    );
    if (ok == null) {
      return {
        assessment: "UNKNOWN",
        confidence: "LOW",
        method: "UNKNOWN",
        reasoning: `Observed ${bounds.display} is inconclusive for "${criterion.name}".`,
      };
    }
    if (ok) {
      return {
        assessment: criterion.isRequired ? "STRONG" : "MODERATE",
        confidence: "HIGH",
        method: "DETERMINISTIC",
        reasoning: `Observed ${bounds.display} satisfies ${criterion.name}.`,
      };
    }
    return {
      assessment: "NO_FIT",
      confidence: "HIGH",
      method: "DETERMINISTIC",
      reasoning: `Observed ${bounds.display} does not satisfy ${criterion.name}.`,
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
        assessment: ok ? "STRONG" : "NO_FIT",
        confidence: "HIGH",
        method: "DETERMINISTIC",
        reasoning: ok
          ? `Text contains expected value for "${criterion.name}".`
          : `Text does not contain expected value for "${criterion.name}".`,
      };
    }

    if (
      criterion.operator === "IN" ||
      criterion.operator === "EQUALS" ||
      criterion.operator === "NOT_IN" ||
      criterion.operator === "NOT_EQUALS"
    ) {
      const targets = Array.isArray(criterion.targetValue)
        ? criterion.targetValue.map(normalizeText).filter(Boolean)
        : [normalizeText(criterion.targetValue)];
      if (targets.filter(Boolean).length === 0) {
        return {
          assessment: "UNKNOWN",
          confidence: "LOW",
          method: "REQUIRES_AI",
          reasoning: "Semantic interpretation required.",
        };
      }
      const matched = targets.some(
        (t) => t && (actual === t || actual.includes(t)),
      );
      const ok =
        criterion.operator === "NOT_IN" || criterion.operator === "NOT_EQUALS"
          ? !matched
          : matched;
      return {
        assessment: ok ? "STRONG" : "NO_FIT",
        confidence: "HIGH",
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

