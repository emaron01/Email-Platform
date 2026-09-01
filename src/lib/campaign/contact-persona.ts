/**
 * Explicit persona decisions for campaign contacts.
 * Scoring may leave matchedPersonaId null (multi-match, no title fit).
 * Generation never silently uses campaign or in-play fallbacks.
 */

export type ContactPersonaSource =
  | "override"
  | "chosen"
  | "matched"
  | "draft"
  | "none";

export type ContactPersonaDecision = {
  personaId: string | null;
  source: ContactPersonaSource;
  /** True when personaId is set from chosen, matched, or draft. */
  hasDecision: boolean;
  /** True when the rep must confirm a persona before generating. */
  needsConfirmation: boolean;
  /** Campaign default offered in the UI — not used for generation until confirmed. */
  suggestedPersonaId: string | null;
  /** Rep-facing explanation when needsConfirmation. */
  decisionReason: string | null;
};

export function personaDecisionReasonFromSkip(
  aiSkipReason: string | null | undefined,
): string | null {
  switch (aiSkipReason) {
    case "MULTI_PERSONA_MATCH":
      return "Title matched more than one persona — choose which applies.";
    case "NO_TITLE_FIT":
      return "Title did not match a persona — choose one for this contact.";
    case "UNRESOLVED_MANDATORY":
      return "Scoring could not confirm a single persona — choose one for this contact.";
    default:
      return aiSkipReason
        ? "No persona was matched — choose one for this contact."
        : null;
  }
}

export function resolveContactPersonaDecision(input: {
  overridePersonaId?: string | null;
  chosenPersonaId?: string | null;
  matchedPersonaId?: string | null;
  draftPersonaId?: string | null;
  suggestedPersonaId?: string | null;
  aiSkipReason?: string | null;
}): ContactPersonaDecision {
  if (input.overridePersonaId) {
    return {
      personaId: input.overridePersonaId,
      source: "override",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: input.suggestedPersonaId ?? null,
      decisionReason: null,
    };
  }
  if (input.chosenPersonaId) {
    return {
      personaId: input.chosenPersonaId,
      source: "chosen",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: input.suggestedPersonaId ?? null,
      decisionReason: null,
    };
  }
  if (input.matchedPersonaId) {
    return {
      personaId: input.matchedPersonaId,
      source: "matched",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: input.suggestedPersonaId ?? null,
      decisionReason: null,
    };
  }
  if (input.draftPersonaId) {
    return {
      personaId: input.draftPersonaId,
      source: "draft",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: input.suggestedPersonaId ?? null,
      decisionReason: null,
    };
  }
  const reason = personaDecisionReasonFromSkip(input.aiSkipReason);
  return {
    personaId: null,
    source: "none",
    hasDecision: false,
    needsConfirmation: true,
    suggestedPersonaId: input.suggestedPersonaId ?? null,
    decisionReason: reason,
  };
}
