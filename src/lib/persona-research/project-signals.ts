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

function criterionKey(name: string, criterionType: string): string {
  return `${criterionType.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
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

/**
 * Build criterion drafts from draft.criteria plus signal arrays.
 * Signal-derived rows dedupe against explicit draft.criteria by name+type.
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
    pushUnique({
      name: signal.text,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      description: "Positive role signal — evidence this buyer role fits.",
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: false,
      isDisqualifier: false,
      researchGuidance:
        "Look for professional signals that indicate this role scope.",
      source: "AI_INTERPRETED",
    });
  }

  for (const signal of asSignalList(draft.negativeRoleSignals)) {
    pushUnique({
      name: signal.text,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
      description: "Negative role signal — evidence against this buyer role.",
      operator: "EXISTS",
      importance: signal.isDisqualifying ? "CRITICAL" : "MEDIUM",
      isRequired: false,
      isDisqualifier: signal.isDisqualifying,
      researchGuidance:
        "Confirm whether contact evidence contradicts this buyer role.",
      source: "AI_INTERPRETED",
    });
  }

  for (const area of asStringList(draft.ownershipAreas)) {
    pushUnique({
      name: area,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      description: "Ownership area for this buyer role.",
      operator: "EXISTS",
      importance: "CRITICAL",
      isRequired: true,
      isDisqualifier: false,
      researchGuidance:
        "Confirm ownership / scope from role evidence — not title alone.",
      source: "AI_INTERPRETED",
    });
  }

  for (const kpi of asStringList(draft.kpisAndAccountabilities)) {
    pushUnique({
      name: kpi,
      criterionType: PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
      description: "KPI or accountability for this buyer role.",
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: true,
      isDisqualifier: false,
      researchGuidance:
        "Confirm KPIs / accountabilities from responsibilities evidence.",
      source: "AI_INTERPRETED",
    });
  }

  return out;
}

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
      rows.push({
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
    }
    return rows;
  } catch {
    return null;
  }
}

/** Merge explicit draft criteria with projected signals for review UI. */
export function buildPersonaCriteriaForReview(
  draft: PersonaAiDraft,
): PersonaCriterionFormRow[] {
  const fromDraft: PersonaCriterionFormRow[] = (draft.criteria ?? []).map(
    (c) => ({
      name: c.name,
      criterionType: c.criterionType,
      description: c.description ?? null,
      importance: c.importance ?? "MEDIUM",
      isRequired: c.isRequired ?? false,
      isDisqualifier: c.isDisqualifier ?? false,
      researchGuidance: c.researchGuidance ?? null,
      manuallyEdited: false,
    }),
  );

  const projected = projectPersonaSignalsToCriteria(draft).map((c) => ({
    name: c.name,
    criterionType: c.criterionType,
    description: c.description,
    importance: c.importance,
    isRequired: c.isRequired,
    isDisqualifier: c.isDisqualifier,
    researchGuidance: c.researchGuidance,
    manuallyEdited: false,
  }));

  const keys = new Set(
    fromDraft.map((c) => criterionKey(c.name, c.criterionType)),
  );
  const merged = [...fromDraft];
  for (const row of projected) {
    const key = criterionKey(row.name, row.criterionType);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(row);
  }
  return merged;
}

/** Read profileJson from an approved Persona and project only missing criteria. */
export function projectSignalsFromProfileJson(
  profileJson: unknown,
  existingCriteria: Array<{ name: string; criterionType: string }>,
): ProjectedPersonaCriterionDraft[] {
  if (!profileJson || typeof profileJson !== "object") return [];
  const draft = profileJson as PersonaAiDraft;
  const existingKeys = new Set(
    existingCriteria.map((c) => criterionKey(c.name, c.criterionType)),
  );
  return projectPersonaSignalsToCriteria(draft).filter(
    (c) => !existingKeys.has(criterionKey(c.name, c.criterionType)),
  );
}
