import type { AiMessage } from "@/lib/ai/types";
import type { PersonaSnapshot } from "@/lib/scoring/types";

export const TITLE_SUGGESTION_PROMPT_VERSION = "1";

export type TitleSuggestionPersonaInput = Pick<
  PersonaSnapshot,
  "id" | "name" | "definition" | "responsibilities" | "targetTitles"
>;

export function personaRoleSummary(
  persona: TitleSuggestionPersonaInput,
): string {
  return (
    persona.definition?.trim() ||
    persona.responsibilities?.trim() ||
    ""
  );
}

export function buildTitleSuggestionMessages(input: {
  personas: TitleSuggestionPersonaInput[];
  unmatchedTitles: string[];
}): AiMessage[] {
  const system = `You map unmatched job titles to existing buyer personas for a B2B product.
Prompt version: ${TITLE_SUGGESTION_PROMPT_VERSION}

You receive each persona's name, role summary, and likely titles (targetTitles), plus a list of distinct unmatched titles from a contact list.

RULES:
- Return exactly one suggestion object per unmatched title. Do not invent extra titles.
- proposedPersonaId MUST be one of the provided persona ids, or null.
- You MUST be allowed to return no match. Null is the correct answer when the title does not belong to any listed persona.
- Do not force a match. A generic company-owner title (Founder, Co-Founder, President, Chairman, CEO, Owner) often does not map to a functional persona — return null unless a persona's likely titles or role summary clearly includes that class of buyer.
- Adjacent functional titles MAY map even when the exact string is missing from likely titles. Example: "VP of Sales Operations" can map to a Revenue Operations persona whose summary covers sales/revenue operations, even if likely titles only list "VP Revenue Operations".
- "President of Sales" is a sales-leadership title, not a generic President — it may map to a sales or CRO persona.
- Do not map a title to a persona solely because of shared seniority (VP, Director, Chief).
- confidence is HIGH, MEDIUM, LOW, or NONE. Use NONE when proposedPersonaId is null.
- reasoning is one sentence.

Return a single JSON object matching the required schema.`;

  const user = JSON.stringify(
    {
      instruction:
        "For each unmatched title, propose at most one persona or return proposedPersonaId null.",
      personas: input.personas.map((persona) => ({
        id: persona.id,
        name: persona.name,
        roleSummary: personaRoleSummary(persona),
        targetTitles: persona.targetTitles ?? [],
      })),
      unmatchedTitles: input.unmatchedTitles,
    },
    null,
    2,
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Approximate prompt size for cost reporting (characters, not tokens). */
export function estimateTitleSuggestionInputChars(input: {
  personas: TitleSuggestionPersonaInput[];
  unmatchedTitles: string[];
}): number {
  return buildTitleSuggestionMessages(input).reduce(
    (sum, message) => sum + message.content.length,
    0,
  );
}
