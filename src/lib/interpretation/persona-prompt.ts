/**
 * Persona interpretation prompt + payload (Node-safe for unit tests).
 * Campaign / Offer CTA data must never appear here.
 */

import { PERSONA_INTERPRETATION_PROMPT_VERSION } from "@/lib/criteria/types";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import type { AiMessage } from "@/lib/ai/types";
import type { PersonaAuthoritativeFields } from "@/lib/persona/save";

export type PersonaInterpretationPayload = {
  productName: string;
  productDescription: string | null;
  fields: PersonaAuthoritativeFields;
  existingCriteria: CriterionSnapshot[];
};

/**
 * Build messages for Persona interpretation.
 * Payload includes authoritative Persona fields only — never campaign/CTA/offer.
 */
export function buildPersonaInterpretationMessages(
  input: PersonaInterpretationPayload,
): AiMessage[] {
  const system = `You are a production buyer-persona interpretation engine.
Prompt version: ${PERSONA_INTERPRETATION_PROMPT_VERSION}

The user Persona definition is AUTHORITATIVE source data. Your job is to derive concise structured criteria for contact research and scoring. Do NOT rewrite or replace the user's raw Persona fields.

PERSONA SEMANTICS (buyer role — not a campaign):
- Likely Titles: literal job-title evidence only (e.g. "CRO", "VP Sales"). Do NOT invent generic categories like "Sales Leader", "Executive", or "Management" as titles unless the user explicitly listed them as titles.
- Department / Function: organizational function (e.g. Sales, Finance, Facilities) — NOT buyer-role labels like "Sales Leader".
- Seniority: organizational level (C-Suite, VP, Director, Manager) — not a title list and not a department.
- Primary Responsibilities / ownership: what the person owns, manages, decides, or is accountable for. These drive role fit more than titles.
- Problems / Pain Points: problems that make a solution relevant.
- Desired Outcomes From Your Solution: BUSINESS/OPERATIONAL results the buyer wants from adopting a solution like ours (reduce time, improve confidence, identify risk earlier, etc.). This is NEVER a campaign conversion action.
- Messaging Notes: communication guidance ONLY. Do NOT create scoring/fit criteria from messaging notes unless the user explicitly framed them as role/pain/outcome criteria.

CRITICAL SEPARATION:
- Desired Outcomes From Your Solution ≠ Campaign CTA / conversion goal.
- Never emit criteria whose target is meeting, demo, reply, call, trial, assessment, "meeting/demo", or similar conversion actions as Desired Outcomes.
- Do not infer Desired Outcomes from product marketing CTAs. Only use the user's desiredOutcomes / pain / responsibilities / definition.

STRUCTURED CRITERIA RULES:
1. Title Match ≠ Role Match. Titles are weak/preliminary evidence; responsibilities and ownership determine persona fit for ambiguous titles.
2. Decompose rich natural-language into the MINIMUM set of concise, independently assessable atomic criteria (short phrases). NEVER copy multi-paragraph prose into a single CONTAINS targetValue.
3. Prefer criterionType slugs: title_pattern, department, seniority, responsibility, ownership, pain, desired_outcome, signal, disqualifier.
4. Prefer operators that match the question: IN/EQUALS for title lists; CONTAINS or semantic EXISTS-style guidance for responsibilities/pain/outcomes with SHORT target phrases; avoid dumping entire paragraphs.
5. Include researchGuidance for criteria that need contact-level evidence.
6. Do not invent pains, outcomes, titles, or departments not implied by the authoritative fields.
7. Messaging notes must not become fit criteria.
8. Return JSON matching the schema only.`;

  const f = input.fields;
  const user = JSON.stringify({
    product: {
      name: input.productName,
      description: input.productDescription,
      // Product context only for domain vocabulary — not campaign/offer/CTA.
    },
    authoritativePersona: {
      name: f.name,
      definition: f.definition,
      additionalContext: f.additionalContext,
      likelyTitles: f.targetTitles,
      departmentFunction: f.department,
      seniority: f.seniority,
      primaryResponsibilities: f.responsibilities,
      problemsPainPoints: f.painPoints,
      desiredOutcomesFromYourSolution: f.desiredOutcomes,
      messagingNotes: f.messagingNotes,
      messagingNotesPolicy:
        "Do not create fit criteria from messagingNotes unless explicitly role/pain/outcome criteria.",
    },
    // Explicitly absent domains (must remain absent):
    // campaign, offer, cta, conversionGoal, meetingGoal, demoGoal
    existingCriteria: input.existingCriteria.map((c) => ({
      name: c.name,
      type: c.criterionType,
      operator: c.operator,
      manuallyEdited: c.manuallyEdited ?? false,
    })),
    responseSchema: {
      criteria: [
        {
          name: "string — concise criterion label",
          description: "string|null — short clarification, not a prose dump",
          criterionType:
            "title_pattern|department|seniority|responsibility|ownership|pain|desired_outcome|signal|disqualifier",
          dataType: "TEXT|NUMBER|BOOLEAN|ENUM|MULTI_SELECT|...",
          operator: "EQUALS|CONTAINS|IN|EXISTS|...",
          targetValue:
            "short phrase or list — never multi-paragraph pasted prose",
          importance: "CRITICAL|HIGH|MEDIUM|LOW",
          isRequired: "boolean",
          isDisqualifier: "boolean",
          researchGuidance: "string|null",
          sortOrder: "number",
        },
      ],
    },
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Assert payload JSON does not contain campaign/CTA contamination keys. */
export function personaInterpretationPayloadHasCampaignContamination(
  userMessageJson: string,
): boolean {
  try {
    const parsed = JSON.parse(userMessageJson) as Record<string, unknown>;
    const banned = [
      "campaign",
      "offer",
      "cta",
      "conversionGoal",
      "conversion_goal",
      "meetingGoal",
      "demoGoal",
      "callToAction",
    ];
    const keys = collectKeys(parsed);
    return banned.some((b) => keys.has(b.toLowerCase()));
  } catch {
    return true;
  }
}

function collectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      into.add(k.toLowerCase());
      collectKeys(v, into);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  }
  return into;
}
