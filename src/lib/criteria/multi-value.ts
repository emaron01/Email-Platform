/**
 * Normalize multi-value IN targets.
 * Production bug: AI stored ["salesforce.com or hubspot CRM"] as one string.
 */

/**
 * Split a single string that embeds list separators into discrete values.
 * Returns the original string alone when no separator is present.
 */
export function splitEmbeddedListValue(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Prefer " or " / " and " before commas so "salesforce.com or hubspot CRM" splits.
  const parts = trimmed
    .split(/\s+or\s+|\s+and\s+|,/i)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [trimmed];
  return parts;
}

/**
 * For IN / NOT_IN / MULTI_SELECT: ensure targetValue is a discrete string array.
 * Also mirrors into allowedValues when empty.
 */
export function normalizeInOperatorValues(input: {
  operator: string;
  dataType?: string;
  targetValue?: unknown;
  allowedValues?: unknown;
}): {
  targetValue: unknown;
  allowedValues: unknown;
  splitPerformed: boolean;
} {
  const op = input.operator.toUpperCase();
  const needsList = op === "IN" || op === "NOT_IN" || input.dataType === "MULTI_SELECT";
  if (!needsList) {
    return {
      targetValue: input.targetValue,
      allowedValues: input.allowedValues,
      splitPerformed: false,
    };
  }

  let splitPerformed = false;
  let values: string[] = [];

  if (Array.isArray(input.targetValue)) {
    for (const item of input.targetValue) {
      if (typeof item === "string") {
        const parts = splitEmbeddedListValue(item);
        if (parts.length > 1) splitPerformed = true;
        values.push(...parts);
      } else if (item != null && item !== "") {
        values.push(String(item));
      }
    }
  } else if (typeof input.targetValue === "string") {
    values = splitEmbeddedListValue(input.targetValue);
    if (values.length > 1) splitPerformed = true;
  } else if (input.targetValue != null) {
    values = [String(input.targetValue)];
  }

  // Deduplicate while preserving order (case-insensitive).
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }

  const existingAllowed = Array.isArray(input.allowedValues)
    ? input.allowedValues.map(String).filter(Boolean)
    : [];

  return {
    targetValue: deduped.length > 0 ? deduped : input.targetValue,
    allowedValues:
      existingAllowed.length > 0
        ? existingAllowed
        : deduped.length > 0
          ? deduped
          : input.allowedValues,
    splitPerformed,
  };
}
