/**
 * Real CRO persona draft observed on setup run cmt4ggi2w0009qp2nupjsq0h4 (Aug 2026).
 * AI draft.criteria carried inverted isDisqualifier flags; signal arrays duplicated concepts.
 */
import type { PersonaAiDraft } from "@/lib/persona-research/contract";

export const CRO_PERSONA_SETUP_RUN_ID = "cmt4ggi2w0009qp2nupjsq0h4";

export const CRO_PERSONA_DRAFT_FIXTURE: PersonaAiDraft = {
  name: "Chief Revenue Officer",
  likelyTitles: ["CRO", "Chief Revenue Officer"],
  departmentFunction: "Sales / Revenue",
  seniority: "C-Suite",
  roleSummary: "Executive accountable for revenue attainment and forecast governance.",
  primaryResponsibilities: ["Owns revenue forecast governance"],
  ownershipAreas: ["Revenue forecast governance"],
  kpisAndAccountabilities: ["Owns revenue forecast governance"],
  organizationalPressures: [],
  painPoints: [],
  desiredOutcomesFromSolution: [],
  buyingRole: null,
  decisionInfluence: null,
  positiveRoleSignals: ["Leads a B2B sales organization"],
  negativeRoleSignals: [
    "Role is focused primarily on marketing, finance, or customer success without sales-forecast ownership",
  ],
  likelyObjections: [],
  terminology: [],
  messagingNotes: [],
  personaSpecificPositioning: [],
  proofPointsToEmphasize: [],
  researchGuidance: [],
  criteria: [
    {
      name: "Owns revenue forecast governance",
      criterionType: "responsibility",
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: true,
      isDisqualifier: true,
    },
    {
      name: "Leads a B2B sales organization",
      criterionType: "positive_role_signal",
      operator: "EXISTS",
      importance: "HIGH",
      isRequired: false,
      isDisqualifier: true,
    },
    {
      name: "Role is focused primarily on marketing, finance, or customer success without sales-forecast ownership",
      criterionType: "negative_role_signal",
      operator: "EXISTS",
      importance: "MEDIUM",
      isRequired: false,
      isDisqualifier: false,
    },
  ],
  confidence: "HIGH",
  evidenceRefs: [],
  provenanceAssessments: [],
};
