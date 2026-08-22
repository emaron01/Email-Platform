/**
 * Persona signal → PersonaCriterion projection tests.
 */
import { describe, expect, it } from "vitest";
import { identifyPersonaEvidenceGaps } from "@/lib/contact-research/gaps";
import { getApplicableDimensions } from "@/lib/scoring/dimensions";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import {
  PERSONA_SIGNAL_CRITERION_TYPES,
  buildPersonaCriteriaForReview,
  capPersonaCriteria,
  normalizeCriterionSemanticKey,
  projectPersonaSignalsToCriteria,
  projectSignalsFromProfileJson,
} from "@/lib/persona-research/project-signals";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import { CRO_PERSONA_DRAFT_FIXTURE } from "@/lib/persona-research/fixtures/cro-setup-run-draft";

const richDraft: PersonaAiDraft = {
  name: "VP Revenue Operations",
  likelyTitles: ["VP RevOps"],
  departmentFunction: "Revenue Operations",
  seniority: "VP",
  roleSummary: "Owns forecast process",
  primaryResponsibilities: [],
  ownershipAreas: ["Sales forecasting process", "CRM hygiene"],
  kpisAndAccountabilities: ["Forecast accuracy", "Pipeline coverage"],
  organizationalPressures: [],
  painPoints: [],
  desiredOutcomesFromSolution: [],
  buyingRole: null,
  decisionInfluence: null,
  positiveRoleSignals: ["Owns weekly forecast call"],
  negativeRoleSignals: ["!Pure marketing scope only"],
  likelyObjections: [],
  terminology: [],
  messagingNotes: [],
  personaSpecificPositioning: [],
  proofPointsToEmphasize: [],
  researchGuidance: [],
  criteria: [],
  confidence: "HIGH",
  evidenceRefs: [],
  provenanceAssessments: [],
};

describe("projectPersonaSignalsToCriteria", () => {
  it("rich signal arrays with empty draft.criteria produce non-empty rows", () => {
    const rows = projectPersonaSignalsToCriteria(richDraft);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.criterionType.includes("ownership"))).toBe(true);
    expect(rows.some((r) => r.criterionType.includes("responsib"))).toBe(true);
    expect(rows.some((r) => r.criterionType.includes("signal"))).toBe(true);
  });

  it("duplicate signal/criterion pairs produce one row in review merge", () => {
    const draft: PersonaAiDraft = {
      ...richDraft,
      ownershipAreas: ["Sales forecasting process"],
      criteria: [
        {
          name: "Sales forecasting process",
          criterionType: "ownership",
          operator: "EXISTS",
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
        },
      ],
    };
    const review = buildPersonaCriteriaForReview(draft).criteria;
    const ownershipRows = review.filter((r) =>
      r.criterionType.toLowerCase().includes("ownership"),
    );
    expect(ownershipRows).toHaveLength(1);
  });

  it("a positive role signal never produces isDisqualifier = true", () => {
    const rows = projectPersonaSignalsToCriteria({
      ...richDraft,
      negativeRoleSignals: [],
      ownershipAreas: [],
      kpisAndAccountabilities: [],
    });
    expect(rows.every((r) => !r.isDisqualifier)).toBe(true);
    const positive = rows.find((r) => r.name.includes("forecast call"));
    expect(positive?.isDisqualifier).toBe(false);
  });

  it("negative signal marked disqualifying produces isDisqualifier = true; unmarked produces false", () => {
    const rows = projectPersonaSignalsToCriteria(richDraft);
    const neg = rows.find((r) => r.name.includes("Pure marketing scope"));
    expect(neg?.isDisqualifier).toBe(true);

    const soft = projectPersonaSignalsToCriteria({
      ...richDraft,
      negativeRoleSignals: ["Mostly marketing scope"],
      positiveRoleSignals: [],
      ownershipAreas: [],
      kpisAndAccountabilities: [],
    })[0]!;
    expect(soft.isDisqualifier).toBe(false);
  });

  it("ownership and KPI projections default to isRequired = false", () => {
    const rows = projectPersonaSignalsToCriteria({
      ...richDraft,
      positiveRoleSignals: [],
      negativeRoleSignals: [],
    });
    for (const row of rows) {
      expect(row.isRequired).toBe(false);
      expect(row.isDisqualifier).toBe(false);
    }
  });

  it("Revenue forecast governance and Owns revenue forecast governance dedupe to one row", () => {
    const review = buildPersonaCriteriaForReview({
      ...richDraft,
      criteria: [],
      ownershipAreas: ["Revenue forecast governance"],
      kpisAndAccountabilities: ["Owns revenue forecast governance"],
      positiveRoleSignals: [],
      negativeRoleSignals: [],
    }).criteria;
    const semanticMatches = review.filter(
      (row) =>
        normalizeCriterionSemanticKey(row.name) === "revenue forecast governance",
    );
    expect(semanticMatches).toHaveLength(1);
  });

  it("caps a draft producing 40 signals at the policy value with required/disqualifying retained", () => {
    const manySignals = Array.from({ length: 20 }, (_, i) => `Positive signal ${i}`);
    const manyOwnership = Array.from({ length: 10 }, (_, i) => `Ownership area ${i}`);
    const manyKpis = Array.from({ length: 10 }, (_, i) => `KPI ${i}`);
    const draft: PersonaAiDraft = {
      ...richDraft,
      positiveRoleSignals: manySignals,
      negativeRoleSignals: ["!Hard disqualifier"],
      ownershipAreas: manyOwnership,
      kpisAndAccountabilities: manyKpis,
      criteria: [
        {
          name: "Explicit required criterion",
          criterionType: "responsibility",
          operator: "EXISTS",
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
        },
      ],
    };

    const { criteria, droppedCount } = buildPersonaCriteriaForReview(draft, {
      maxCriteria: 15,
    });
    expect(criteria.length).toBe(15);
    expect(droppedCount).toBeGreaterThan(0);
    expect(criteria.some((row) => row.isDisqualifier)).toBe(true);
    expect(criteria.some((row) => row.isRequired)).toBe(true);
  });

  it("corrects flags on the real CRO setup-run draft fixture", () => {
    const { criteria } = buildPersonaCriteriaForReview(CRO_PERSONA_DRAFT_FIXTURE);

    const ownsForecast = criteria.find((row) =>
      row.name.toLowerCase().includes("owns revenue forecast governance"),
    );
    expect(ownsForecast?.isDisqualifier).toBe(false);
    expect(ownsForecast?.isRequired).toBe(true);

    const positive = criteria.find((row) =>
      row.name.includes("Leads a B2B sales organization"),
    );
    expect(positive?.isDisqualifier).toBe(false);

    const negative = criteria.find((row) =>
      row.name.includes("marketing, finance, or customer success"),
    );
    expect(negative?.isDisqualifier).toBe(false);

    const forecastSemantic = criteria.filter(
      (row) =>
        normalizeCriterionSemanticKey(row.name) === "revenue forecast governance",
    );
    expect(forecastSemantic).toHaveLength(1);
  });

  it("projected types are recognized by getApplicableDimensions heuristics", () => {
    const projected = projectPersonaSignalsToCriteria(richDraft);
    const persona = {
      name: "VP RevOps",
      criteria: projected.map((p, i) => ({
        id: `c-${i}`,
        name: p.name,
        criterionType: p.criterionType,
        dataType: "TEXT" as const,
        operator: "EXISTS" as const,
        importance: p.importance,
        isRequired: p.isRequired,
        isDisqualifier: p.isDisqualifier,
        sortOrder: i,
      })),
    };
    const dims = getApplicableDimensions({
      icp: { criteria: [] } as unknown as Parameters<
        typeof getApplicableDimensions
      >[0]["icp"],
      persona: persona as unknown as Parameters<
        typeof getApplicableDimensions
      >[0]["persona"],
      product: { name: "Product" } as unknown as Parameters<
        typeof getApplicableDimensions
      >[0]["product"],
    });
    expect(
      dims.some((d) => d.dimension === "Role / Responsibility Match"),
    ).toBe(true);
    expect(dims.some((d) => d.dimension === "Title Match")).toBe(true);
  });

  it("projected signal types participate in contact-research gap detection", () => {
    const signalRow = projectPersonaSignalsToCriteria({
      ...richDraft,
      ownershipAreas: [],
      kpisAndAccountabilities: [],
      positiveRoleSignals: ["Runs forecast committee"],
      negativeRoleSignals: [],
    })[0]!;

    const signalGaps = identifyPersonaEvidenceGaps(
      [
        {
          name: signalRow.name,
          criterionType: signalRow.criterionType,
          dataType: "TEXT",
          operator: "EXISTS",
          importance: signalRow.importance,
          isRequired: signalRow.isRequired,
          isDisqualifier: signalRow.isDisqualifier,
          sortOrder: 0,
        },
      ],
      {
        currentTitle: "VP Sales",
        professionalSignals: "Leads forecast committee weekly",
      },
      "VP Sales",
    );
    expect(signalGaps).not.toContain(signalRow.name);

    const ownershipRow = projectPersonaSignalsToCriteria({
      ...richDraft,
      positiveRoleSignals: [],
      negativeRoleSignals: [],
    }).find((r) => r.criterionType.includes("ownership"))!;

    const ownershipGaps = identifyPersonaEvidenceGaps(
      [
        {
          name: ownershipRow.name,
          criterionType: ownershipRow.criterionType,
          dataType: "TEXT",
          operator: "EXISTS",
          importance: ownershipRow.importance,
          isRequired: ownershipRow.isRequired,
          isDisqualifier: ownershipRow.isDisqualifier,
          sortOrder: 0,
        },
      ],
      {
        ownershipAreas: "Owns sales forecasting process end-to-end",
      },
      null,
    );
    expect(ownershipGaps).not.toContain(ownershipRow.name);
  });

  it("manual criterion survives reinterpretation planning", () => {
    const plan = planCriterionReinterpretation({
      existing: [
        {
          id: "manual-1",
          name: "Owns weekly forecast call",
          criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
          manuallyEdited: true,
        },
      ],
      aiDrafts: [
        {
          name: "Owns weekly forecast call",
          criterionType: PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
          dataType: "TEXT",
          operator: "EXISTS",
          importance: "HIGH",
          isRequired: false,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
    });
    expect(plan.keepIds).toEqual(["manual-1"]);
    expect(plan.insertDrafts).toHaveLength(0);
  });

  it("profileJson projection skips rows that already exist", () => {
    const { criteria: projected } = projectSignalsFromProfileJson(richDraft, [
      {
        name: "Sales forecasting process",
        criterionType: PERSONA_SIGNAL_CRITERION_TYPES.ownership,
      },
    ]);
    expect(
      projected.some((p) => p.name === "Sales forecasting process"),
    ).toBe(false);
    expect(projected.length).toBeGreaterThan(0);
  });

  it("existing approved personas are not changed until projection is invoked", () => {
    const existing = projectPersonaSignalsToCriteria(richDraft).map((row) => ({
      name: row.name,
      criterionType: row.criterionType,
    }));
    const secondPass = projectSignalsFromProfileJson(richDraft, existing);
    expect(secondPass.criteria).toHaveLength(0);
  });

  it("capPersonaCriteria keeps disqualifiers before supporting rows", () => {
    const rows = [
      { name: "support 1", criterionType: "ownership", isRequired: false, isDisqualifier: false },
      { name: "support 2", criterionType: "ownership", isRequired: false, isDisqualifier: false },
      { name: "hard no", criterionType: "negative_role_signal", isRequired: false, isDisqualifier: true },
    ];
    const capped = capPersonaCriteria(rows, 2);
    expect(capped.criteria.some((row) => row.name === "hard no")).toBe(true);
    expect(capped.droppedCount).toBe(1);
  });
});
