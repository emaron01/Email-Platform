import { describe, expect, it } from "vitest";
import {
  personaDecisionReasonFromSkip,
  resolveContactPersonaDecision,
} from "@/lib/campaign/contact-persona";

describe("contact persona decision", () => {
  it("prefers explicit chosen persona over matched and draft", () => {
    expect(
      resolveContactPersonaDecision({
        chosenPersonaId: "persona_chosen",
        matchedPersonaId: "persona_matched",
        draftPersonaId: "persona_draft",
      }),
    ).toEqual({
      personaId: "persona_chosen",
      source: "chosen",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: null,
      decisionReason: null,
    });
  });

  it("uses matched persona when no explicit choice exists", () => {
    expect(
      resolveContactPersonaDecision({
        matchedPersonaId: "persona_matched",
        suggestedPersonaId: "persona_campaign",
      }),
    ).toEqual({
      personaId: "persona_matched",
      source: "matched",
      hasDecision: true,
      needsConfirmation: false,
      suggestedPersonaId: "persona_campaign",
      decisionReason: null,
    });
  });

  it("requires confirmation when scoring left no persona match", () => {
    expect(
      resolveContactPersonaDecision({
        matchedPersonaId: null,
        suggestedPersonaId: "persona_campaign",
        aiSkipReason: "MULTI_PERSONA_MATCH",
      }),
    ).toEqual({
      personaId: null,
      source: "none",
      hasDecision: false,
      needsConfirmation: true,
      suggestedPersonaId: "persona_campaign",
      decisionReason:
        "Title matched more than one persona — choose which applies.",
    });
  });

  it("does not silently use the campaign persona as a decision", () => {
    expect(
      resolveContactPersonaDecision({
        matchedPersonaId: null,
        suggestedPersonaId: "persona_campaign",
        aiSkipReason: "NO_TITLE_FIT",
      }).hasDecision,
    ).toBe(false);
  });

  it("maps skip reasons to rep-facing copy", () => {
    expect(personaDecisionReasonFromSkip("MULTI_PERSONA_MATCH")).toContain(
      "more than one persona",
    );
    expect(personaDecisionReasonFromSkip("NO_TITLE_FIT")).toContain(
      "did not match",
    );
  });
});
