import { asTitleList } from "@/lib/persona/manual-target-titles";
import { targetTitleProblem } from "@/lib/persona/target-title-rules";

export const ERIK_WORKSPACE_NAME = "Erik's Workspace";

export const ERIK_PERSONA_TITLE_REPAIR_NAMES = [
  "Chief Revenue Officer",
  "Vice president of Sales",
] as const;

export type PersonaTitleRepairInput = {
  personaId: string;
  personaName: string;
  currentTitles: unknown;
  draft: unknown;
  /** unmatchedTitle values from APPROVED title suggestions for this persona. */
  approvedSuggestionTitles: readonly string[];
};

export type PersonaTitleRepairPlan = {
  personaId: string;
  personaName: string;
  before: string[];
  after: string[];
  fromDraft: string[];
  keptApprovedAdditions: string[];
  omittedApprovedTitles: Array<{ title: string; problem: string }>;
};

export function draftLikelyTitles(draft: unknown): string[] {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new Error("Persona draft is missing, so target titles cannot be repaired.");
  }
  const raw = (draft as { likelyTitles?: unknown }).likelyTitles;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "Persona draft has no likelyTitles, so target titles cannot be repaired.",
    );
  }
  const titles = raw.map(String).map((title) => title.trim()).filter(Boolean);
  if (titles.length === 0) {
    throw new Error(
      "Persona draft has no likelyTitles, so target titles cannot be repaired.",
    );
  }
  return titles;
}

function remember(title: string, after: string[], seen: Set<string>): boolean {
  const key = title.toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  after.push(title);
  return true;
}

/**
 * Start from the setup-run draft, then keep approved suggestion titles that
 * still name a function. Bare seniority tokens and cut-off fragments are
 * omitted. An approved title already present in the draft is not repeated.
 */
export function planPersonaTitleRepair(
  input: PersonaTitleRepairInput,
): PersonaTitleRepairPlan {
  const before = asTitleList(input.currentTitles);
  const after: string[] = [];
  const fromDraft: string[] = [];
  const keptApprovedAdditions: string[] = [];
  const omittedApprovedTitles: Array<{ title: string; problem: string }> = [];
  const seen = new Set<string>();

  for (const title of draftLikelyTitles(input.draft)) {
    const problem = targetTitleProblem(title);
    if (problem) {
      throw new Error(
        `Draft title for "${input.personaName}" cannot be stored: ${problem}`,
      );
    }
    if (remember(title, after, seen)) fromDraft.push(title);
  }

  for (const title of input.approvedSuggestionTitles) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    const problem = targetTitleProblem(trimmed);
    if (problem) {
      omittedApprovedTitles.push({ title: trimmed, problem });
      continue;
    }
    if (seen.has(trimmed.toLowerCase())) continue;
    remember(trimmed, after, seen);
    keptApprovedAdditions.push(trimmed);
  }

  if (after.length === 0) {
    throw new Error(
      `Repair of "${input.personaName}" would leave no target titles.`,
    );
  }

  return {
    personaId: input.personaId,
    personaName: input.personaName,
    before,
    after,
    fromDraft,
    keptApprovedAdditions,
    omittedApprovedTitles,
  };
}
