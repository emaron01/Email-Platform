/**
 * Project Persona AI signal arrays into PersonaCriterion drafts.
 *
 * Type strings match existing scoring / gap heuristics:
 * - responsibility → dimensions.ts personaHasResponsibilityCriteria ("responsib")
 * - ownership → dimensions.ts + gaps.ts ("ownership")
 * - positive_role_signal / negative_role_signal → gaps.ts ("signal")
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
};

/** Leading ownership verbs stripped before semantic dedupe (case-insensitive). */
const LEADING_OWNERSHIP_VERB_PATTERN =
  /^(?:owns|owning|responsible for|accountable for|manages|managing|leads|leading|oversees|overseeing|directs|directing|drives|driving|runs|running)\s+/i;

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

function criterionTypeRank(criterionType: string): number {
  const lower = criterionType.toLowerCase();
  if (lower.includes("ownership")) return 0;
  if (lower.includes("responsib")) return 1;
  if (lower.includes("positive") && lower.includes("signal")) return 2;
  if (lower.includes("negative") && lower.includes("signal")) return 3;
  return 4;
}

function isPositiveRoleSignalType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return lower.includes("positive") && lower.includes("signal");
}

function isNegativeRoleSignalType(criterionType: string): boolean {
  const lower = criterionType.toLowerCase();
  return lower.includes("negative") && lower.includes("signal");
}

function isOwnershipType(criterionType: string): boolean {
  return criterionType.toLowerCase().includes("ownership");
}

function isResponsibilityType(criterionType: string): boolean {
  return criterionType.toLowerCase().includes("responsib");
}

/**
 * Normalize isRequired / isDisqualifier by criterion semantics.
 * Signal projection arrays always use explicit rules; draft.criteria keeps AI isRequired.
 */
export function normalizeCriterionFlags(input: {
  criterionType: string;
  isRequired?: boolean;
  isDisqualifier?: boolean;
  isDisqualifyingSignal?: boolean;
  fromSignalProjection?: boolean;
}): { isRequired: boolean; isDisqualifier: boolean } {
  const { criterionType } = input;

  if (isPositiveRoleSignalType(criterionType)) {
    return { isRequired: false, isDisqualifier: false };
  }

  if (isNegativeRoleSignalType(criterionType)) {
    return {
      isRequired: false,
      isDisqualifier: Boolean(
        input.isDisqualifyingSignal ?? input.isDisqualifier,
      ),
    };
  }

  if (isOwnershipType(criterionType) || isResponsibilityType(criterionType)) {
    return {
      isRequired: input.fromSignalProjection
        ? false
        : Boolean(input.isRequired),
      isDisqualifier: false,
    };
  }

  return {
    isRequired: Boolean(input.isRequired),
    isDisqualifier: false,
  };
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
    return { text: raw, isDisqualifying: false };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const text = String(obj.text ?? obj.signal ?? obj.name ?? "").trim();
    if (!text) return null;
    return {
      text,
      isDisqualifying: Boolean(obj.isDisqualifying ?? obj.disqualifying),
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
  if (row.isRequired) return 1;
  return 2 + importanceRank(row.importance);
}

/** Cap merged criteria — retain required/disqualifying rows first. */
export function capPersonaCriteria(
  rows: PersonaCriterionFormRow[],
  maxCriteria: number,
): { criteria: PersonaCriterionFormRow[]; droppedCount: number } {
  if (maxCriteria < 1 || rows.length <= maxCriteria) {
    return { criteria: rows, droppedCount: 0 };
  }

  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const rankDiff = retentionRank(a.row) - retentionRank(b.row);
    return rankDiff !== 0 ? rankDiff : a.index - b.index;
  });

  const kept = indexed.slice(0, maxCriteria).sort((a, b) => a.index - b.index);
  return {
    criteria: kept.map((entry) => entry.row),
    droppedCount: rows.length - kept.length,
  };
}

/**
 * Build criterion drafts from draft.criteria plus signal arrays.
 * Signal-derived rows dedupe against explicit draft.criteria by semantic key.
 */
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
    const flags = normalizeCriterionFlags({
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      fromSignalProjection: true,
    });
    pushUnique({
      name: signal.text,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      description: "Positive role signal — evidence this buyer role fits.",
      operator: "EXISTS",
      importance: "HIGH",
      ...flags,
      researchGuidance:
        "Look for professional signals that indicate this role scope.",
      source: "AI_INTERPRETED",
    });
  }

  for (const signal of asSignalList(draft.negativeRoleSignals)) {
    const flags = normalizeCriterionFlags({
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      isDisqualifyingSignal: signal.isDisqualifying,
      fromSignalProjection: true,
    });
    pushUnique({
      name: signal.text,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      description: "Negative role signal — evidence against this buyer role.",
      operator: "EXISTS",
      importance: signal.isDisqualifying ? "CRITICAL" : "MEDIUM",
      ...flags,
      researchGuidance:
        "Confirm whether contact evidence contradicts this buyer role.",
      source: "AI_INTERPRETED",
    });
  }

  for (const area of asStringList(draft.ownershipAreas)) {
    const flags = normalizeCriterionFlags({
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      fromSignalProjection: true,
    });
    pushUnique({
      name: area,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      description: "Ownership area for this buyer role.",
      operator: "EXISTS",
      importance: "CRITICAL",
      ...flags,
      researchGuidance:
        "Confirm ownership / scope from role evidence — not title alone.",
      source: "AI_INTERPRETED",
    });
  }

  for (const kpi of asStringList(draft.kpisAndAccountabilities)) {
    const flags = normalizeCriterionFlags({
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
      fromSignalProjection: true,
    });
    pushUnique({
      name: kpi,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
      description: "KPI or accountability for this buyer role.",
      operator: "EXISTS",
      importance: "HIGH",
      ...flags,
      researchGuidance:
        "Confirm KPIs / accountabilities from responsibilities evidence.",
      source: "AI_INTERPRETED",
    });
  }

  return out;
}

const CRITERION_IMPORTANCE = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** Parse criteriaJson submitted from PersonaDraftReview. */
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
      const flags = normalizeCriterionFlags({
        criterionType,
        isRequired: Boolean(row.isRequired),
        isDisqualifier: Boolean(row.isDisqualifier),
      });
      rows.push({
        name,
        criterionType,
        description:
          row.description == null ? null : String(row.description),
        importance,
        ...flags,
        researchGuidance:
          row.researchGuidance == null
            ? null
            : String(row.researchGuidance),
        manuallyEdited: Boolean(row.manuallyEdited),
      });
    }
    return rows;
  } catch {
    return null;
  }
}

/** Merge explicit draft criteria with projected signals for review UI. */
export function buildPersonaCriteriaForReview(
  draft: PersonaAiDraft,
  options?: { maxCriteria?: number },
): PersonaCriteriaReviewResult {
  const fromDraft: MergeRow[] = (draft.criteria ?? []).map((c) => {
    const flags = normalizeCriterionFlags({
      criterionType: c.criterionType,
      isRequired: c.isRequired ?? false,
      isDisqualifier: c.isDisqualifier ?? false,
    });
    return {
      name: c.name,
      criterionType: c.criterionType,
      description: c.description ?? null,
      importance: c.importance ?? "MEDIUM",
      ...flags,
      researchGuidance: c.researchGuidance ?? null,
      manuallyEdited: false,
      source: "draft",
    };
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
      source: "projected",
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
  if (maxCriteria == null) {
    return { criteria: deduped, droppedCount: 0 };
  }
  const capped = capPersonaCriteria(deduped, maxCriteria);
  return {
    criteria: capped.criteria,
    droppedCount: capped.droppedCount,
  };
}

/** Read profileJson from an approved Persona and project only missing criteria. */
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

  const cappedNames = new Set(
    capped.criteria.map((row) => criterionKey(row.name, row.criterionType)),
  );

  return {
    criteria: projected.filter((row) =>
      cappedNames.has(criterionKey(row.name, row.criterionType)),
    ),
    droppedCount: capped.droppedCount,
  };
}
