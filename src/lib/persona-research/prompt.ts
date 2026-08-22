import type { AiMessage } from "@/lib/ai/types";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import type { PersonaResearchExcerpt } from "@/lib/persona-research/progressive-search";

export function buildPersonaSynthesisMessages(input: {
  productName: string;
  productSnapshot: Record<string, unknown>;
  productMessaging: Record<string, unknown> | null;
  buyerRole: SuggestedBuyerRole;
  userContext: Record<string, unknown> | null;
  productEvidence: EvidenceExcerpt[];
  personaEvidence: PersonaResearchExcerpt[];
  icpContext: Record<string, unknown> | null;
}): AiMessage[] {
  const system = `You are an expert GTM Persona research analyst.
Prompt version: ${PERSONA_SYNTHESIS_PROMPT_VERSION}

Synthesize ONE PersonaDraft for the selected buyer role in the context of the Approved Product.

KNOWLEDGE LAYERS (keep distinct in provenanceAssessments / evidenceRefs):
1. CUSTOMER_EVIDENCE — Approved Product + ProductEvidenceBundle + user Persona materials
2. MODEL_INFERENCE — disciplined domain reasoning about roles/responsibilities/KPIs (never present as customer fact)
3. WEB_EVIDENCE — only from provided persona web excerpts

RULES:
1. Persona = BUYER ROLE / RESPONSIBILITY PROFILE. Titles are evidence, not the definition.
2. Same title can mean different ownership scopes — disambiguate using Product + context.
3. Desired Outcomes From Solution = outcomes from USING THE CUSTOMER'S PRODUCT — never meeting/demo/CTA goals.
4. Do NOT score contacts. Do NOT generate campaigns/emails.
5. Prefer responsibility/ownership criteria over literal title match.
6. Mark provenance honestly. Do not claim MODEL_INFERENCE as researched fact.
7. confidence must be exactly HIGH, MEDIUM, or LOW (uppercase).
8. evidenceRefs entries MUST include claim (string). sourceIds may be empty.
9. Required fields may be returned as empty arrays or null when evidence does not support them. An empty array is correct; inventing content is not.
10. isDisqualifier means a contact matching this criterion is NOT a fit and should be excluded. A must-have requirement is isRequired: true, NOT isDisqualifier: true. Never set isDisqualifier on a positive signal, ownership area, or responsibility.
11. negativeRoleSignals is REQUIRED and must not be empty. Every buyer role has titles that look similar but are not the buyer — list concrete negative signals for those non-buyer scopes.
12. negativeRoleSignals must describe people who should NOT be contacted — roles sharing similar titles but lacking the ownership that makes this persona a buyer. Every entry is treated as an exclusion.
13. Classify each negativeRoleSignal with exclusionTestability:
    - TITLE_TESTABLE — decidable from the contact's title/department alone (e.g. "Sales representative focused primarily on individual quota").
    - EVIDENCE_TESTABLE — requires researched responsibilities or ownership (e.g. "CRM administrator … WITHOUT ownership of forecasting or revenue governance").
14. Return JSON matching the schema only (personaDraft).`;

  const user = JSON.stringify({
    productName: input.productName,
    approvedProduct: input.productSnapshot,
    productMessaging: input.productMessaging,
    selectedBuyerRole: {
      name: input.buyerRole.name,
      likelyTitles: input.buyerRole.likelyTitles,
      departmentFunction: input.buyerRole.departmentFunction,
      whyThisRoleMatters: input.buyerRole.whyThisRoleMatters,
    },
    userContext: input.userContext,
    icpContext: input.icpContext,
    productEvidence: input.productEvidence.map((e) => ({
      sourceId: e.sourceId,
      provenanceClass: "CUSTOMER_EVIDENCE",
      displayName: e.displayName,
      text: e.text.slice(0, 6_000),
    })),
    personaWebEvidence: input.personaEvidence.map((e) => ({
      sourceId: e.sourceId,
      provenanceClass: e.provenanceClass,
      displayName: e.displayName,
      text: e.text.slice(0, 4_000),
      url: e.url ?? null,
    })),
    responseSchema: {
      personaDraft: {
        name: "string (REQUIRED)",
        likelyTitles: ["string"],
        departmentFunction: "string|null",
        seniority: "string|null",
        roleSummary: "string|null",
        primaryResponsibilities: ["string"],
        ownershipAreas: ["string"],
        kpisAndAccountabilities: ["string"],
        painPoints: ["string"],
        desiredOutcomesFromSolution: ["string"],
        positiveRoleSignals: ["string"],
        negativeRoleSignals: [
          {
            text: "string (REQUIRED — person who should NOT be contacted)",
            exclusionTestability: "TITLE_TESTABLE|EVIDENCE_TESTABLE",
          },
        ],
        confidence: "HIGH|MEDIUM|LOW (exact uppercase only)",
        evidenceRefs: [
          {
            claim: "string (REQUIRED)",
            sourceIds: ["string"],
            note: "string|null",
            provenanceClasses: [
              "CUSTOMER_EVIDENCE|WEB_EVIDENCE|MODEL_INFERENCE",
            ],
          },
        ],
        criteria: [
          {
            name: "string",
            criterionType: "string",
            importance: "CRITICAL|HIGH|MEDIUM|LOW",
            isDisqualifier: "boolean",
            exclusionTestability:
              "TITLE_TESTABLE|EVIDENCE_TESTABLE|null (required when isDisqualifier)",
          },
        ],
      },
    },
    domainsAbsent: ["campaign", "cta", "contactScoring", "emailGeneration"],
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
