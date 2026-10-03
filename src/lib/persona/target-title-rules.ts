import { TenantError } from "@/lib/tenant/errors";

const STOPWORDS = new Set([
  "of",
  "the",
  "and",
  "for",
  "a",
  "an",
  "in",
  "at",
  "to",
  "or",
]);

/** Level words. A title made only of these does not name a function. */
const SENIORITY_TOKENS = new Set([
  "vp",
  "svp",
  "evp",
  "director",
  "head",
  "chief",
  "senior",
  "sr",
  "jr",
  "lead",
  "manager",
  "vice",
  "president",
]);

/** Short tokens that are complete words, not a title cut off mid-word. */
const COMPLETE_SHORT_TOKENS = new Set([
  "vp",
  "svp",
  "evp",
  "cro",
  "ceo",
  "cfo",
  "coo",
  "cmo",
  "cio",
  "cto",
  "gm",
  "us",
  "uk",
  "it",
  "hr",
  "ai",
  "na",
  "am",
  "pm",
  "ae",
]);

function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

export function targetTitleProblem(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const parts = tokens(trimmed);
  if (parts.length > 0 && parts.every((token) => SENIORITY_TOKENS.has(token))) {
    return `"${trimmed}" only names a seniority level. Include the function, such as "Vice President of Sales".`;
  }
  const last = trimmed.split(/\s+/).at(-1)?.replace(/[^A-Za-z]/g, "") ?? "";
  if (
    last.length > 0 &&
    last.length < 3 &&
    !COMPLETE_SHORT_TOKENS.has(last.toLowerCase())
  ) {
    return `"${trimmed}" is cut off. Store the full title.`;
  }
  return null;
}

export function assertTargetTitles(titles: string[]): void {
  const problems = titles
    .map((title) => targetTitleProblem(title))
    .filter((problem): problem is string => problem != null);
  if (problems.length > 0) {
    throw new TenantError(problems.join(" "));
  }
}

/** One title per line, or a JSON array. Commas stay inside a title. */
export function parseTargetTitleField(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new TenantError(
        "Likely titles could not be read. Enter one title per line.",
      );
    }
    if (!Array.isArray(parsed)) {
      throw new TenantError(
        "Likely titles could not be read. Enter one title per line.",
      );
    }
    return parsed.map(String).map((title) => title.trim()).filter(Boolean);
  }
  return trimmed
    .split(/\r?\n/)
    .map((title) => title.trim())
    .filter(Boolean);
}

export function targetTitlesFieldValue(titles: readonly string[]): string {
  return JSON.stringify(titles);
}
