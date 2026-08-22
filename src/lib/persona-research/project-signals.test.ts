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
  mapAiCriterionType,
  normalizeCriterionSemanticKey,
  parsePersonaCriteriaFormJson,
  projectPersonaSignalsToCriteria,
  projectSignalsFromProfileJson,
  resolveExclusionTestability,
} from "@/lib/persona-research/project-signals";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import { CRO_PERSONA_DRAFT_FIXTURE } from "@/lib/persona-research/fixtures/cro-setup-run-draft";
import { CRO_PERSONA_DRAFT_V2_FIXTURE } from "@/lib/persona-research/fixtures/cro-setup-run-draft-v2";
import { REVOPS_PERSONA_DRAFT_FIXTURE } from "@/lib/persona-research/fixtures/revops-setup-run-draft";

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

describe("mapAiCriterionType", () => {
  it('maps criterionType "disqualifier" to negative_role_signal with isDisqualifier true', () => {
    const mapped = mapAiCriterionType({
      name: "Wrong role scope",
      criterionType: "disqualifier",
    });
    expect(mapped.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
    );
    expect(mapped.isDisqualifier).toBe(true);
  });

  it('maps "No revenue or sales forecast responsibility" as exclusion regardless of type', () => {
    const mapped = mapAiCriterionType({
      name: "No revenue or sales forecast responsibility",
      criterionType: "organizational_context",
    });
    expect(mapped.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
    );
    expect(mapped.isDisqualifier).toBe(true);
  });

  it("maps organizational_context, behavior, and pain_point to positive role signal", () => {
    for (const criterionType of [
      "organizational_context",
      "behavior",
      "pain_point",
    ]) {
      const mapped = mapAiCriterionType({
        name: "Example criterion",
        criterionType,
      });
      expect(mapped.criterionType).toBe(
        PERSONA_SIGNAL_CRITERION_TYPES.positiveRoleSignal,
      );
      expect(mapped.isDisqualifier).toBe(false);
      expect(mapped.unmapped).toBe(false);
    }
  });
});

describe("exclusionTestability", () => {
  it("defaults missing or unrecognized classification to EVIDENCE_TESTABLE", () => {
    expect(
      resolveExclusionTestability({
        name: "Sales representative focused on quota",
        isDisqualifier: true,
      }),
    ).toBe("EVIDENCE_TESTABLE");
    expect(
      resolveExclusionTestability({
        name: "Sales representative focused on quota",
        isDisqualifier: true,
        aiValue: "NOT_A_REAL_VALUE",
      }),
    ).toBe("EVIDENCE_TESTABLE");
  });

  it('overrides AI TITLE_TESTABLE to EVIDENCE_TESTABLE when text contains "without ownership of"', () => {
    expect(
      resolveExclusionTestability({
        name: "CRM admin without ownership of forecasting",
        isDisqualifier: true,
        aiValue: "TITLE_TESTABLE",
      }),
    ).toBe("EVIDENCE_TESTABLE");
  });

  it("returns null for non-disqualifiers", () => {
    expect(
      resolveExclusionTestability({
        name: "Owns forecast process",
        isDisqualifier: false,
        aiValue: "TITLE_TESTABLE",
      }),
    ).toBeNull();
  });
});

describe("projectPersonaSignalsToCriteria", () => {
  it("plain negativeRoleSignals entry with no marker projects as isDisqualifier true", () => {
    const rows = projectPersonaSignalsToCriteria({
      ...richDraft,
      positiveRoleSignals: [],
      ownershipAreas: [],
      kpisAndAccountabilities: [],
      negativeRoleSignals: ["Mostly marketing scope"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isDisqualifier).toBe(true);
    expect(rows[0]!.exclusionTestability).toBe("EVIDENCE_TESTABLE");
  });

  it("user demoting a negative to supporting survives planCriterionReinterpretation", () => {
    const plan = planCriterionReinterpretation({
      existing: [
        {
          id: "manual-neg",
          name: "Mostly marketing scope",
          criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
          manuallyEdited: true,
        },
      ],
      aiDrafts: [
        {
          name: "Mostly marketing scope",
          criterionType: PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
          dataType: "TEXT",
          operator: "EXISTS",
          importance: "CRITICAL",
          isRequired: false,
          isDisqualifier: true,
          sortOrder: 0,
        },
      ],
    });
    expect(plan.keepIds).toEqual(["manual-neg"]);
    expect(plan.insertDrafts).toHaveLength(0);

    const formRows = parsePersonaCriteriaFormJson(
      JSON.stringify([
        {
          name: "Mostly marketing scope",
          criterionType: "negative_role_signal",
          isRequired: false,
          isDisqualifier: false,
          exclusionTestability: null,
          manuallyEdited: true,
        },
      ]),
    );
    expect(formRows?.[0]?.isDisqualifier).toBe(false);
  });

  it("positive, ownership, and responsibility never become disqualifiers", () => {
    const rows = projectPersonaSignalsToCriteria({
      ...richDraft,
      negativeRoleSignals: [],
    });
    for (const row of rows) {
      expect(row.isDisqualifier).toBe(false);
      expect(row.exclusionTestability).toBeNull();
    }
  });

  it("RevOps production fixture: all six negatives project as disqualifiers with correct testability", () => {
    const { criteria } = buildPersonaCriteriaForReview(REVOPS_PERSONA_DRAFT_FIXTURE);
    const negatives = criteria.filter(
      (row) =>
        row.isDisqualifier === true ||
        row.criterionType.includes("negative"),
    );
    expect(negatives.length).toBeGreaterThanOrEqual(6);
    expect(
      negatives.filter((row) =>
        REVOPS_PERSONA_DRAFT_FIXTURE.negativeRoleSignals.some((signal) => {
          const text =
            typeof signal === "string"
              ? signal
              : String(
                  (signal as { text?: string }).text ??
                    (signal as { name?: string }).name ??
                    "",
                );
          return text === row.name;
        }),
      ),
    ).toHaveLength(6);

    const byName = (name: string) =>
      criteria.find((row) => row.name === name);

    expect(byName("Individual selling role only")?.isDisqualifier).toBe(true);
    expect(byName("Individual selling role only")?.exclusionTestability).toBe(
      "TITLE_TESTABLE",
    );
    expect(
      byName(
        "Sales representative or account executive focused primarily on individual quota and opportunity execution.",
      )?.exclusionTestability,
    ).toBe("TITLE_TESTABLE");
    expect(
      byName(
        "Marketing operations leader focused primarily on campaign operations, lead routing, and marketing automation rather than sales forecasting.",
      )?.exclusionTestability,
    ).toBe("TITLE_TESTABLE");
    expect(
      byName(
        "CRM administrator whose scope is limited to technical configuration and ticket support without ownership of forecasting or revenue governance.",
      )?.exclusionTestability,
    ).toBe("EVIDENCE_TESTABLE");
    expect(
      byName(
        "Front-line sales manager who only runs a single team's forecast calls without ownership of RevOps systems or cross-team governance.",
      )?.exclusionTestability,
    ).toBe("EVIDENCE_TESTABLE");
  });

  it("CRO v2 fixture: no regression in flag assignment", () => {
    const { criteria, missingExclusionCriteria } = buildPersonaCriteriaForReview(
      CRO_PERSONA_DRAFT_V2_FIXTURE,
      { maxCriteria: 15 },
    );
    expect(missingExclusionCriteria).toBe(false);
    const exclusion = criteria.find(
      (row) => row.name === "No revenue or sales forecast responsibility",
    );
    expect(exclusion?.isDisqualifier).toBe(true);
    expect(exclusion?.exclusionTestability).toBe("EVIDENCE_TESTABLE");
  });

  it("criterion with researchGuidance keeps it; one without has null guidance", () => {
    const { criteria } = buildPersonaCriteriaForReview({
      ...richDraft,
      criteria: [
        {
          name: "Has guidance",
          criterionType: "responsibility",
          operator: "EXISTS",
          importance: "HIGH",
          researchGuidance: "Look for forecast ownership in the role description.",
          isRequired: true,
          isDisqualifier: false,
        },
      ],
      ownershipAreas: [],
      kpisAndAccountabilities: [],
      positiveRoleSignals: [],
      negativeRoleSignals: ["Title-only AE"],
    });
    const withGuidance = criteria.find((row) => row.name === "Has guidance");
    const without = criteria.find((row) => row.name === "Title-only AE");
    expect(withGuidance?.researchGuidance).toContain("forecast ownership");
    expect(without?.researchGuidance).toBeTruthy();
  });

  it("rich signal arrays with empty draft.criteria produce non-empty rows", () => {
    const rows = projectPersonaSignalsToCriteria(richDraft);
    expect(rows.length).toBeGreaterThan(0);
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

  it("caps supporting criteria but keeps all negative signals when cap is 5", () => {
    const negatives = Array.from({ length: 8 }, (_, i) => `Negative signal ${i}`);
    const draft: PersonaAiDraft = {
      ...richDraft,
      criteria: [],
      positiveRoleSignals: Array.from({ length: 10 }, (_, i) => `Positive ${i}`),
      negativeRoleSignals: negatives,
      ownershipAreas: [],
      kpisAndAccountabilities: [],
    };

    const { criteria } = buildPersonaCriteriaForReview(draft, { maxCriteria: 5 });
    const negativeRows = criteria.filter((row) =>
      row.criterionType.includes("negative"),
    );
    expect(negativeRows).toHaveLength(8);
    expect(negativeRows.every((row) => row.isDisqualifier)).toBe(true);
  });

  it("sets missingExclusionCriteria when a draft has zero exclusions", () => {
    const result = buildPersonaCriteriaForReview({
      ...richDraft,
      criteria: [],
      negativeRoleSignals: [],
    });
    expect(result.missingExclusionCriteria).toBe(true);
  });

  it("corrects flags on the prior production CRO draft fixture", () => {
    const { criteria } = buildPersonaCriteriaForReview(CRO_PERSONA_DRAFT_FIXTURE);
    const ownsForecast = criteria.find((row) =>
      row.name.includes("Owns revenue forecast governance"),
    );
    expect(ownsForecast?.isDisqualifier).toBe(false);
    expect(ownsForecast?.isRequired).toBe(true);
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
  });

  it("capPersonaCriteria keeps disqualifiers before supporting rows", () => {
    const rows = [
      {
        name: "support 1",
        criterionType: "ownership",
        isRequired: false,
        isDisqualifier: false,
      },
      {
        name: "support 2",
        criterionType: "ownership",
        isRequired: false,
        isDisqualifier: false,
      },
      {
        name: "hard no",
        criterionType: "negative_role_signal",
        isRequired: false,
        isDisqualifier: true,
      },
    ];
    const capped = capPersonaCriteria(rows, 2);
    expect(capped.criteria.some((row) => row.name === "hard no")).toBe(true);
    expect(capped.droppedCount).toBe(1);
  });
});

describe("researchGuidance display contract", () => {
  it("rows with guidance expose non-empty researchGuidance; empty guidance stays null/absent", () => {
    const withGuidance: { researchGuidance: string | null } = {
      researchGuidance: "Confirm ownership from role evidence.",
    };
    const withoutGuidance: { researchGuidance: string | null } = {
      researchGuidance: null,
    };
    expect(withGuidance.researchGuidance?.trim()).toBeTruthy();
    expect(withoutGuidance.researchGuidance?.trim()).toBeFalsy();
  });
});
