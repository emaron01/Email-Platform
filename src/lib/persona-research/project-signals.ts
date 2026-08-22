/**
 * Project Persona AI signal arrays into PersonaCriterion drafts.
 */

import type { PersonaAiDraft } from "@/lib/persona-research/contract";

export const PERSONA_SIGNAL_CRITERION_TYPES = {
  positiveRoleSignal: "positive_role_signal",
  negativeRoleSignal: "negative_role_signal",
  ownership: "ownership",
  responsibility: "responsibility",
} as const;

export type ProjectedPersonaCriterionDraft = {
  name: string;
  criterionType: string;
  description: string | null;
  operator: "EXISTS";
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  isRequired: boolean;
  isDisqualifier: boolean;
  researchGuidance: string | null;
  source: "AI_INTERPRETED";
};

export type RoleSignalEntry = {
  text: string;
  isDisqualifying: boolean;
};

export type PersonaCriterionFormRow = {
  name: string;
  criterionType: string;
  description?: string | null;
  importance?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  isRequired?: boolean;
  isDisqualifier?: boolean;
  researchGuidance?: string | null;
  manuallyEdited?: boolean;
};

export type PersonaCriteriaReviewResult = {
  criteria: PersonaCriterionFormRow[];
  droppedCount: number;
  unmappedCriterionTypes: string[];
  missingExclusionCriteria: boolean;
};

/** Leading ownership verbs stripped before semantic dedupe (case-insensitive). */
const LEADING_OWNERSHIP_VERB_PATTERN =
  /^(?:owns|owning|responsible for|accountable for|manages|managing|leads|leading|oversees|overseeing|directs|directing|drives|driving|runs|running)\s+/i;

/** Names that express exclusion regardless of declared criterionType. */
const EXCLUSION_NAME_PATTERN =
  /^(?:no|not|lack of|without|absence of)\b/i;

export type MappedAiCriterion = {
  criterionType: string;
  isDisqualifier: boolean;
  unmapped: boolean;
  originalType: string;
};

function criterionKey(name: string, criterionType: string): string {
  return `${criterionType.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

/** Semantic key for near-duplicate detection across signal arrays. */
export function normalizeCriterionSemanticKey(name: string): string {
  let normalized = name.trim().toLowerCase();
  normalized = normalized.replace(LEADING_OWNERSHIP_VERB_PATTERN, "");
  normalized = normalized.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return normalized;
}

export function isExclusionCriterionName(name: string): boolean {
  return EXCLUSION_NAME_PATTERN.test(name.trim());
}

export function isPositiveRoleSignalType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal ||
    (lower.includes("positive") && lower.includes("signal"))
  );
}

export function isNegativeRoleSignalType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal ||
    (lower.includes("negative") && lower.includes("signal"))
  );
}

function isOwnershipType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.ownership ||
    lower.includes("ownership")
  );
}

function isResponsibilityType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return (
    lower === PERSONA_SIGNAL_CRITERION_TYPES.responsibility ||
    lower.includes("responsib")
  );
}

function isProtectedFromCap(row: PersonaCriterionFormRow): boolean {
  return row.isDisqualifier === true || isNegativeRoleSignalType(row.criterionType);
}

/**
 * Map free-form AI criterionType (+ name polarity) to platform vocabulary.
 *
 * | AI type pattern | Mapped type | isDisqualifier |
 * |---|---|---|
 * | Name starts with No/Not/Lack of/Without/Absence of | negative_role_signal | true |
 * | contains disqualif or exclusion | negative_role_signal | true |
 * | contains negative | negative_role_signal | from AI/signal flag |
 * | contains ownership or word "own" | ownership | false |
 * | contains responsib, accountab, or kpi | responsibility | false |
 * | contains pain, outcome, signal, context, or behavior | positive_role_signal | false |
 * | Already platform vocabulary | unchanged | per type rules |
 * | No rule matched | positive_role_signal | false (unmapped) |
 */
export function mapAiCriterionType(input: {
  name: string;
  criterionType: string;
  isDisqualifier?: boolean;
  isDisqualifyingSignal?: boolean;
}): MappedAiCriterion {
  const originalType = input.criterionType.trim() || "unknown";
  const lower = originalType.toLowerCase();
  const name = input.name.trim();

  if (isExclusionCriterionName(name)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: true,
      unmapped: false,
      originalType,
    };
  }

  if (isPositiveRoleSignalType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (isNegativeRoleSignalType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: Boolean(
        input.isDisqualifyingSignal ?? input.isDisqualifier,
      ),
      unmapped: false,
      originalType,
    };
  }
  if (isOwnershipType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (isResponsibilityType(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }

  if (lower.includes("disqualif") || lower.includes("exclusion")) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: true,
      unmapped: false,
      originalType,
    };
  }
  if (lower.includes("negative")) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifier: Boolean(
        input.isDisqualifyingSignal ?? input.isDisqualifier,
      ),
      unmapped: false,
      originalType,
    };
  }
  if (lower.includes("ownership") || /\bown\b/.test(lower)) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (
    lower.includes("responsib") ||
    lower.includes("accountab") ||
    lower.includes("kpi")
  ) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }
  if (
    lower.includes("pain") ||
    lower.includes("outcome") ||
    lower.includes("signal") ||
    lower.includes("context") ||
    lower.includes("behavior")
  ) {
    return {
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      isDisqualifier: false,
      unmapped: false,
      originalType,
    };
  }

  return {
    criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
    isDisqualifier: false,
    unmapped: true,
    originalType,
  };
}

function criterionTypeRank(criterionType: string): number {
  if (isOwnershipType(criterionType)) return 0;
  if (isResponsibilityType(criterionType)) return 1;
  if (isPositiveRoleSignalType(criterionType)) return 2;
  if (isNegativeRoleSignalType(criterionType)) return 3;
  return 4;
}

export function normalizeCriterionFlags(input: {
  name: string;
  criterionType: string;
  isRequired?: boolean;
  isDisqualifier?: boolean;
  isDisqualifyingSignal?: boolean;
  fromSignalProjection?: boolean;
}): {
  criterionType: string;
  isRequired: boolean;
  isDisqualifier: boolean;
  unmapped: boolean;
} {
  if (input.fromSignalProjection) {
    const mapped = mapAiCriterionType({
      name: input.name,
      criterionType: input.criterionType,
      isDisqualifier: input.isDisqualifier,
      isDisqualifyingSignal: input.isDisqualifyingSignal,
    });
    if (isPositiveRoleSignalType(mapped.criterionType)) {
      return {
        criterionType: mapped.criterionType,
        isRequired: false,
        isDisqualifier: false,
        unmapped: false,
      };
    }
    if (isNegativeRoleSignalType(mapped.criterionType)) {
      return {
        criterionType: mapped.criterionType,
        isRequired: false,
        isDisqualifier: mapped.isDisqualifier,
        unmapped: false,
      };
    }
    if (isOwnershipType(mapped.criterionType) || isResponsibilityType(mapped.criterionType)) {
      return {
        criterionType: mapped.criterionType,
        isRequired: false,
        isDisqualifier: false,
        unmapped: false,
      };
    }
  }

  const mapped = mapAiCriterionType({
    name: input.name,
    criterionType: input.criterionType,
    isDisqualifier: input.isDisqualifier,
    isDisqualifyingSignal: input.isDisqualifyingSignal,
  });

  if (isPositiveRoleSignalType(mapped.criterionType)) {
    return {
      criterionType: mapped.criterionType,
      isRequired: false,
      isDisqualifier: false,
      unmapped: mapped.unmapped,
    };
  }

  if (isNegativeRoleSignalType(mapped.criterionType)) {
    return {
      criterionType: mapped.criterionType,
      isRequired: false,
      isDisqualifier: mapped.isDisqualifier,
      unmapped: mapped.unmapped,
    };
  }

  if (isOwnershipType(mapped.criterionType) || isResponsibilityType(mapped.criterionType)) {
    return {
      criterionType: mapped.criterionType,
      isRequired: input.fromSignalProjection
        ? false
        : Boolean(input.isRequired),
      isDisqualifier: false,
      unmapped: mapped.unmapped,
    };
  }

  return {
    criterionType: mapped.criterionType,
    isRequired: Boolean(input.isRequired),
    isDisqualifier: mapped.isDisqualifier,
    unmapped: mapped.unmapped,
  };
}

export function personaHasExclusionCriteria(
  criteria: PersonaCriterionFormRow[],
): boolean {
  return criteria.some((row) => isProtectedFromCap(row));
}

/** Parse string or structured role-signal entries from AI / profileJson. */
export function parseRoleSignalEntry(value: unknown): RoleSignalEntry | null {
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    if (raw.startsWith("!")) {
      return { text: raw.slice(1).trim(), isDisqualifying: true };
    }
    const disqualifierPrefix = /^\[disqualifier\]\s*/i;
    if (disqualifierPrefix.test(raw)) {
      return {
        text: raw.replace(disqualifierPrefix, "").trim(),
        isDisqualifying: true,
      };
    }
    if (isExclusionCriterionName(raw)) {
      return { text: raw, isDisqualifying: true };
    }
    return { text: raw, isDisqualifying: false };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const text = String(obj.text ?? obj.signal ?? obj.name ?? "").trim();
    if (!text) return null;
    return {
      text,
      isDisqualifying: Boolean(
        obj.isDisqualifying ?? obj.disqualifying ?? isExclusionCriterionName(text),
      ),
    };
  }
  return null;
}

function asSignalList(values: unknown): RoleSignalEntry[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(parseRoleSignalEntry)
    .filter((e): e is RoleSignalEntry => e !== null && Boolean(e.text));
}

function asStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(String).map((s) => s.trim()).filter(Boolean);
}

type MergeRow = PersonaCriterionFormRow & {
  source: "draft" | "projected";
};

function normalizeReviewRow(
  row: Omit<PersonaCriterionFormRow, "criterionType" | "isRequired" | "isDisqualifier"> & {
    name: string;
    criterionType: string;
    isRequired?: boolean;
    isDisqualifier?: boolean;
  },
  options?: { fromSignalProjection?: boolean; isDisqualifyingSignal?: boolean },
): { row: PersonaCriterionFormRow; unmapped: boolean } {
  const normalized = normalizeCriterionFlags({
    name: row.name,
    criterionType: row.criterionType,
    isRequired: row.isRequired,
    isDisqualifier: row.isDisqualifier,
    isDisqualifyingSignal: options?.isDisqualifyingSignal,
    fromSignalProjection: options?.fromSignalProjection,
  });
  return {
    row: {
      ...row,
      criterionType: normalized.criterionType,
      isRequired: normalized.isRequired,
      isDisqualifier: normalized.isDisqualifier,
    },
    unmapped: normalized.unmapped,
  };
}

function shouldReplaceSemanticDuplicate(
  existing: MergeRow,
  incoming: MergeRow,
): boolean {
  if (incoming.isDisqualifier && !existing.isDisqualifier) return true;
  if (incoming.isRequired && !existing.isRequired && !existing.isDisqualifier) {
    return true;
  }
  if (existing.source === "draft" && incoming.source === "projected") {
    return false;
  }
  if (existing.source === "projected" && incoming.source === "draft") {
    return true;
  }
  return (
    criterionTypeRank(incoming.criterionType) <
    criterionTypeRank(existing.criterionType)
  );
}

function mergeCriteriaRows(rows: MergeRow[]): PersonaCriterionFormRow[] {
  const bySemantic = new Map<string, MergeRow>();

  for (const row of rows) {
    const semantic = normalizeCriterionSemanticKey(row.name);
    if (!semantic) continue;

    const existing = bySemantic.get(semantic);
    if (!existing) {
      bySemantic.set(semantic, row);
      continue;
    }

    const exactExisting = criterionKey(existing.name, existing.criterionType);
    const exactIncoming = criterionKey(row.name, row.criterionType);
    if (exactExisting === exactIncoming) continue;

    if (shouldReplaceSemanticDuplicate(existing, row)) {
      bySemantic.set(semantic, row);
    }
  }

  return [...bySemantic.values()].map(({ source: _source, ...rest }) => rest);
}

function importanceRank(
  importance: PersonaCriterionFormRow["importance"] | undefined,
): number {
  switch (importance) {
    case "CRITICAL":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 3;
    default:
      return 4;
  }
}

function retentionRank(row: PersonaCriterionFormRow): number {
  if (row.isDisqualifier) return 0;
  if (isNegativeRoleSignalType(row.criterionType)) return 1;
  if (row.isRequired) return 2;
  return 3 + importanceRank(row.importance);
}

/** Cap merged criteria — exclusions are never dropped. */
export function capPersonaCriteria(
  rows: PersonaCriterionFormRow[],
  maxCriteria: number,
): { criteria: PersonaCriterionFormRow[]; droppedCount: number } {
  if (maxCriteria < 1) {
    return { criteria: [], droppedCount: rows.length };
  }

  const protectedRows = rows.filter((row) => isProtectedFromCap(row));
  const flexibleRows = rows.filter((row) => !isProtectedFromCap(row));

  if (protectedRows.length >= maxCriteria) {
    return {
      criteria: protectedRows,
      droppedCount: rows.length - protectedRows.length,
    };
  }

  const flexibleSlots = maxCriteria - protectedRows.length;
  if (flexibleRows.length <= flexibleSlots) {
    return { criteria: rows, droppedCount: 0 };
  }

  const indexed = flexibleRows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const rankDiff = retentionRank(a.row) - retentionRank(b.row);
    return rankDiff !== 0 ? rankDiff : a.index - b.index;
  });

  const keptFlexible = indexed
    .slice(0, flexibleSlots)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.row);

  const keptKeys = new Set(
    [...protectedRows, ...keptFlexible].map((row) =>
      criterionKey(row.name, row.criterionType),
    ),
  );
  const criteria = rows.filter((row) =>
    keptKeys.has(criterionKey(row.name, row.criterionType)),
  );

  return {
    criteria,
    droppedCount: rows.length - criteria.length,
  };
}

export function projectPersonaSignalsToCriteria(
  draft: Pick<
    PersonaAiDraft,
    | "criteria"
    | "positiveRoleSignals"
    | "negativeRoleSignals"
    | "ownershipAreas"
    | "kpisAndAccountabilities"
  >,
): ProjectedPersonaCriterionDraft[] {
  const existingKeys = new Set(
    (draft.criteria ?? []).map((c) =>
      criterionKey(c.name, c.criterionType),
    ),
  );

  const out: ProjectedPersonaCriterionDraft[] = [];

  function pushUnique(row: ProjectedPersonaCriterionDraft): void {
    const key = criterionKey(row.name, row.criterionType);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    out.push(row);
  }

  for (const signal of asSignalList(draft.positiveRoleSignals)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: signal.text,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
        importance: "HIGH",
      },
      { fromSignalProjection: true },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: "Positive role signal — evidence this buyer role fits.",
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: normalized.isRequired ?? false,
      isDisqualifier: normalized.isDisqualifier ?? false,
      researchGuidance:
        "Look for professional signals that indicate this role scope.",
      source: "AI_INTERPRETED",
    });
  }

  for (const signal of asSignalList(draft.negativeRoleSignals)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: signal.text,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
        importance: signal.isDisqualifying ? "CRITICAL" : "MEDIUM",
      },
      {
        fromSignalProjection: true,
        isDisqualifyingSignal: signal.isDisqualifying,
      },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: "Negative role signal — evidence against this buyer role.",
      operator: "EXISTS",
      importance: signal.isDisqualifying ? "CRITICAL" : "MEDIUM",
      isRequired: normalized.isRequired ?? false,
      isDisqualifier: normalized.isDisqualifier ?? false,
      researchGuidance:
        "Confirm whether contact evidence contradicts this buyer role.",
      source: "AI_INTERPRETED",
    });
  }

  for (const area of asStringList(draft.ownershipAreas)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: area,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
        importance: "CRITICAL",
      },
      { fromSignalProjection: true },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: "Ownership area for this buyer role.",
      operator: "EXISTS",
      importance: "CRITICAL",
      isRequired: normalized.isRequired ?? false,
      isDisqualifier: normalized.isDisqualifier ?? false,
      researchGuidance:
        "Confirm ownership / scope from role evidence — not title alone.",
      source: "AI_INTERPRETED",
    });
  }

  for (const kpi of asStringList(draft.kpisAndAccountabilities)) {
    const { row: normalized } = normalizeReviewRow(
      {
        name: kpi,
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
        importance: "HIGH",
      },
      { fromSignalProjection: true },
    );
    pushUnique({
      name: normalized.name,
      criterionType: normalized.criterionType,
      description: "KPI or accountability for this buyer role.",
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: normalized.isRequired ?? false,
      isDisqualifier: normalized.isDisqualifier ?? false,
      researchGuidance:
        "Confirm KPIs / accountabilities from responsibilities evidence.",
      source: "AI_INTERPRETED",
    });
  }

  return out;
}

const CRITERION_IMPORTANCE = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export function parsePersonaCriteriaFormJson(
  raw: string | null | undefined,
): PersonaCriterionFormRow[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const rows: PersonaCriterionFormRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      const criterionType = String(row.criterionType ?? "").trim();
      if (!name || !criterionType) continue;
      const importance = CRITERION_IMPORTANCE.includes(
        row.importance as (typeof CRITERION_IMPORTANCE)[number],
      )
        ? (row.importance as (typeof CRITERION_IMPORTANCE)[number])
        : "MEDIUM";
      const { row: normalized } = normalizeReviewRow({
        name,
        criterionType,
        description:
          row.description == null ? null : String(row.description),
        importance,
        isRequired: Boolean(row.isRequired),
        isDisqualifier: Boolean(row.isDisqualifier),
        researchGuidance:
          row.researchGuidance == null
            ? null
            : String(row.researchGuidance),
        manuallyEdited: Boolean(row.manuallyEdited),
      });
      rows.push(normalized);
    }
    return rows;
  } catch {
    return null;
  }
}

export function buildPersonaCriteriaForReview(
  draft: PersonaAiDraft,
  options?: { maxCriteria?: number },
): PersonaCriteriaReviewResult {
  const unmappedTypes = new Set<string>();

  const fromDraft: MergeRow[] = (draft.criteria ?? []).map((c) => {
    const { row, unmapped } = normalizeReviewRow({
      name: c.name,
      criterionType: c.criterionType,
      description: c.description ?? null,
      importance: c.importance ?? "MEDIUM",
      isRequired: c.isRequired ?? false,
      isDisqualifier: c.isDisqualifier ?? false,
      researchGuidance: c.researchGuidance ?? null,
      manuallyEdited: false,
    });
    if (unmapped) unmappedTypes.add(c.criterionType);
    return { ...row, source: "draft" as const };
  });

  const projected: MergeRow[] = projectPersonaSignalsToCriteria(draft).map(
    (c) => ({
      name: c.name,
      criterionType: c.criterionType,
      description: c.description,
      importance: c.importance,
      isRequired: c.isRequired,
      isDisqualifier: c.isDisqualifier,
      researchGuidance: c.researchGuidance,
      manuallyEdited: false,
      source: "projected" as const,
    }),
  );

  const exactKeys = new Set<string>();
  const merged: MergeRow[] = [];

  for (const row of [...fromDraft, ...projected]) {
    const exact = criterionKey(row.name, row.criterionType);
    if (exactKeys.has(exact)) continue;
    exactKeys.add(exact);
    merged.push(row);
  }

  const deduped = mergeCriteriaRows(merged);
  const maxCriteria = options?.maxCriteria;
  const capped =
    maxCriteria == null
      ? { criteria: deduped, droppedCount: 0 }
      : capPersonaCriteria(deduped, maxCriteria);

  return {
    criteria: capped.criteria,
    droppedCount: capped.droppedCount,
    unmappedCriterionTypes: [...unmappedTypes].sort(),
    missingExclusionCriteria: !personaHasExclusionCriteria(capped.criteria),
  };
}

export function projectSignalsFromProfileJson(
  profileJson: unknown,
  existingCriteria: Array<{ name: string; criterionType: string }>,
  options?: { maxCriteria?: number },
): { criteria: ProjectedPersonaCriterionDraft[]; droppedCount: number } {
  if (!profileJson || typeof profileJson !== "object") {
    return { criteria: [], droppedCount: 0 };
  }
  const draft = profileJson as PersonaAiDraft;
  const existingKeys = new Set(
    existingCriteria.map((c) => criterionKey(c.name, c.criterionType)),
  );
  const projected = projectPersonaSignalsToCriteria(draft).filter(
    (c) => !existingKeys.has(criterionKey(c.name, c.criterionType)),
  );

  if (options?.maxCriteria == null) {
    return { criteria: projected, droppedCount: 0 };
  }

  const capped = capPersonaCriteria(
    projected.map((row) => ({
      name: row.name,
      criterionType: row.criterionType,
      importance: row.importance,
      isRequired: row.isRequired,
      isDisqualifier: row.isDisqualifier,
    })),
    options.maxCriteria,
  );

  const cappedKeys = new Set(
    capped.criteria.map((row) => criterionKey(row.name, row.criterionType)),
  );

  return {
    criteria: projected.filter((row) =>
      cappedKeys.has(criterionKey(row.name, row.criterionType)),
    ),
    droppedCount: capped.droppedCount,
  };
}
