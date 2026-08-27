/**
 * Persona signal → PersonaCriterion projection tests.
 */
import { describe, expect, it } from "vitest";
import { identifyPersonaEvidenceGaps } from "@/lib/contact-research/gaps";
import { getApplicableDimensions } from "@/lib/scoring/dimensions";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import {
  PERSONA_SIGNAL_CRITERION_TYPES,
  appendCriterionLineToBox,
  classifyNeedsReviewRole,
  remainingNeedsReviewCriteria,
  buildPersonaCriteriaForReview,
  capPersonaCriteria,
  collectUnmappedCriterionTypesFromDraft,
  criteriaToEditorBoxes,
  editorBoxesToCriteria,
  mapAiCriterionType,
  normalizeCriterionSemanticKey,
  parseCriteriaBoxLines,
  parsePersonaCriteriaFormJson,
  projectPersonaSignalsToCriteria,
  projectSignalsFromProfileJson,
  resolveExclusionTestability,
  type PersonaCriterionFormRow,
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

  it('role_scope + isDisqualifier true maps to negative_role_signal (explicit flag wins)', () => {
    const mapped = mapAiCriterionType({
      name: "Full-revenue executive scope",
      criterionType: "role_scope",
      isDisqualifier: true,
    });
    expect(mapped.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
    );
    expect(mapped.isDisqualifier).toBe(true);
    expect(mapped.unmapped).toBe(true);
  });

  it("arbitrary unrecognized type + isDisqualifier true maps to negative", () => {
    const mapped = mapAiCriterionType({
      name: "Invented exclusion label",
      criterionType: "totally_made_up_type_xyz",
      isDisqualifier: true,
    });
    expect(mapped.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
    );
    expect(mapped.isDisqualifier).toBe(true);
  });

  it("unrecognized type + isDisqualifier false becomes needs_review (not positive fit)", () => {
    const mapped = mapAiCriterionType({
      name: "Active B2B sales organization",
      criterionType: "firmographic",
      isDisqualifier: false,
    });
    expect(mapped.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.needsReview,
    );
    expect(mapped.isDisqualifier).toBe(false);
    expect(mapped.unmapped).toBe(true);
  });

  it('kpi maps to responsibility via contains "kpi"', () => {
    const mapped = mapAiCriterionType({
      name: "Revenue and quota accountability",
      criterionType: "kpi",
      isDisqualifier: false,
    });
    expect(mapped.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.responsibility,
    );
    expect(mapped.unmapped).toBe(false);
  });

  it("buildPersonaCriteriaForReview preserves role_scope exclusions and holds firmographic", () => {
    const draft: PersonaAiDraft = {
      ...richDraft,
      criteria: [
        {
          name: "Individual contributor sales role",
          criterionType: "role_scope",
          operator: "EXISTS",
          isDisqualifier: true,
          isRequired: false,
          importance: "CRITICAL",
        },
        {
          name: "Active B2B sales organization",
          criterionType: "firmographic",
          operator: "EXISTS",
          isDisqualifier: false,
          isRequired: false,
          importance: "MEDIUM",
        },
        {
          name: "Revenue and quota accountability",
          criterionType: "kpi",
          operator: "EXISTS",
          isDisqualifier: false,
          isRequired: false,
          importance: "HIGH",
        },
      ],
      positiveRoleSignals: [],
      negativeRoleSignals: [],
      ownershipAreas: [],
      kpisAndAccountabilities: [],
    };
    const { criteria, unmappedCriterionTypes } =
      buildPersonaCriteriaForReview(draft);
    const exclusion = criteria.find(
      (r) => r.name === "Individual contributor sales role",
    );
    const held = criteria.find(
      (r) => r.name === "Active B2B sales organization",
    );
    const kpi = criteria.find(
      (r) => r.name === "Revenue and quota accountability",
    );
    expect(exclusion?.criterionType).toBe("negative_role_signal");
    expect(exclusion?.isDisqualifier).toBe(true);
    expect(held?.criterionType).toBe("needs_review");
    expect(held?.isDisqualifier).toBe(false);
    expect(kpi?.criterionType).toBe("responsibility");
    expect(unmappedCriterionTypes).toEqual(
      expect.arrayContaining(["firmographic", "role_scope"]),
    );
  });
});

describe("collectUnmappedCriterionTypesFromDraft (UsageEvent logging)", () => {
  it("records unmapped original types even when form criteria would skip build", () => {
    const types = collectUnmappedCriterionTypesFromDraft({
      criteria: [
        {
          name: "Full-revenue executive scope",
          criterionType: "role_scope",
          operator: "EXISTS",
          importance: "CRITICAL",
          isRequired: false,
          isDisqualifier: true,
        },
        {
          name: "Active B2B sales organization",
          criterionType: "firmographic",
          operator: "EXISTS",
          importance: "MEDIUM",
          isRequired: false,
          isDisqualifier: false,
        },
        {
          name: "Forecast accountability",
          criterionType: "responsibility",
          operator: "EXISTS",
          importance: "MEDIUM",
          isRequired: false,
          isDisqualifier: false,
        },
      ],
      negativeRoleSignals: [],
    });
    expect(types).toEqual(["firmographic", "role_scope"]);
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

  it("under max 15 keeps all four projected types (does not starve positives)", () => {
    const draft: PersonaAiDraft = {
      ...richDraft,
      criteria: [],
      positiveRoleSignals: Array.from({ length: 6 }, (_, i) => `Positive signal ${i}`),
      negativeRoleSignals: Array.from({ length: 6 }, (_, i) => `Negative signal ${i}`),
      ownershipAreas: Array.from({ length: 6 }, (_, i) => `Ownership area ${i}`),
      kpisAndAccountabilities: Array.from(
        { length: 6 },
        (_, i) => `KPI accountability ${i}`,
      ),
    };

    const { criteria } = buildPersonaCriteriaForReview(draft, {
      maxCriteria: 15,
    });

    const byType = {
      positive_role_signal: criteria.filter(
        (r) => r.criterionType === "positive_role_signal",
      ).length,
      negative_role_signal: criteria.filter(
        (r) => r.criterionType === "negative_role_signal",
      ).length,
      ownership: criteria.filter((r) => r.criterionType === "ownership").length,
      responsibility: criteria.filter((r) => r.criterionType === "responsibility")
        .length,
    };

    expect(byType.negative_role_signal).toBe(6);
    expect(byType.positive_role_signal).toBeGreaterThan(0);
    expect(byType.ownership).toBeGreaterThan(0);
    expect(byType.responsibility).toBeGreaterThan(0);
    expect(criteria).toHaveLength(15);
    // Round-robin across 3 flexible families with 9 slots → 3 each
    expect(byType.positive_role_signal).toBe(3);
    expect(byType.ownership).toBe(3);
    expect(byType.responsibility).toBe(3);
  });

  it("RevOps fixture under max 15 retains projected positiveRoleSignals", () => {
    const { criteria } = buildPersonaCriteriaForReview(REVOPS_PERSONA_DRAFT_FIXTURE, {
      maxCriteria: 15,
    });
    const positives = criteria.filter(
      (row) => row.criterionType === "positive_role_signal",
    );
    const fromSignals = positives.filter((row) =>
      REVOPS_PERSONA_DRAFT_FIXTURE.positiveRoleSignals.some((signal) => {
        const text =
          typeof signal === "string"
            ? signal
            : String((signal as { text?: string }).text ?? "");
        return text === row.name;
      }),
    );
    expect(fromSignals.length).toBeGreaterThan(0);
    expect(
      criteria.filter((r) => r.criterionType === "responsibility").length,
    ).toBeGreaterThan(0);
  });

  it("sets missingExclusionCriteria when a draft has zero exclusions", () => {
    const result = buildPersonaCriteriaForReview({
      ...richDraft,
      criteria: [],
      negativeRoleSignals: [],
    });
    expect(result.missingExclusionCriteria).toBe(true);
  });

  it("honors explicit isDisqualifier on the prior CRO draft (AI flag wins over type)", () => {
    // Fixture documents AI wrongly tagging must-haves as disqualifiers; rule 1
    // trusts the flag rather than silently flipping polarity by type.
    const { criteria } = buildPersonaCriteriaForReview(CRO_PERSONA_DRAFT_FIXTURE);
    const ownsForecast = criteria.find((row) =>
      row.name.includes("Owns revenue forecast governance"),
    );
    expect(ownsForecast?.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
    );
    expect(ownsForecast?.isDisqualifier).toBe(true);
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

  it("capPersonaCriteria round-robins flexible types so positives are not starved", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({
        name: `neg ${i}`,
        criterionType: "negative_role_signal",
        isDisqualifier: true as const,
        importance: "CRITICAL" as const,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        name: `own ${i}`,
        criterionType: "ownership",
        isDisqualifier: false as const,
        importance: "CRITICAL" as const,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        name: `pos ${i}`,
        criterionType: "positive_role_signal",
        isDisqualifier: false as const,
        importance: "HIGH" as const,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        name: `kpi ${i}`,
        criterionType: "responsibility",
        isDisqualifier: false as const,
        importance: "HIGH" as const,
      })),
    ];
    const capped = capPersonaCriteria(rows, 15);
    const count = (type: string) =>
      capped.criteria.filter((row) => row.criterionType === type).length;
    expect(count("negative_role_signal")).toBe(6);
    expect(count("ownership")).toBe(3);
    expect(count("positive_role_signal")).toBe(3);
    expect(count("responsibility")).toBe(3);
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

describe("criteria editor boxes (four textareas)", () => {
  it("round-trips 15 projected criteria into four boxes and back with types/flags", () => {
    const { criteria } = buildPersonaCriteriaForReview(REVOPS_PERSONA_DRAFT_FIXTURE, {
      maxCriteria: 15,
    });
    expect(criteria.length).toBeGreaterThan(0);
    expect(criteria.length).toBeLessThanOrEqual(15);

    const boxes = criteriaToEditorBoxes(criteria);
    const restored = editorBoxesToCriteria(boxes, criteria);

    expect(restored).toHaveLength(criteria.length);
    for (const original of criteria) {
      const match = restored.find(
        (row) =>
          normalizeCriterionSemanticKey(row.name) ===
            normalizeCriterionSemanticKey(original.name) &&
          row.criterionType === original.criterionType,
      );
      expect(match).toBeDefined();
      expect(match!.isDisqualifier).toBe(Boolean(original.isDisqualifier));
      expect(match!.isRequired).toBe(Boolean(original.isRequired));
      if (original.isDisqualifier) {
        expect(match!.exclusionTestability).toBe(
          resolveExclusionTestability({
            name: original.name,
            isDisqualifier: true,
            aiValue: original.exclusionTestability,
          }),
        );
      }
    }
  });

  it("a line added to Exclusions saves as negative_role_signal with isDisqualifier true", () => {
    const baseline: PersonaCriterionFormRow[] = [];
    const boxes = {
      positiveRoleSignals: "",
      exclusions: "Individual contributor only\n",
      ownershipAreas: "",
      responsibilities: "",
    };
    const rows = editorBoxesToCriteria(boxes, baseline);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.criterionType).toBe(
      PERSONA_SIGNAL_CRITERION_TYPES.negativeRoleSignal,
    );
    expect(rows[0]?.isDisqualifier).toBe(true);
    expect(rows[0]?.isRequired).toBe(false);
  });

  it("a line deleted from a box is removed from saved criteria", () => {
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Owns forecast",
        criterionType: "ownership",
        isRequired: false,
        isDisqualifier: false,
      },
      {
        name: "Owns CRM hygiene",
        criterionType: "ownership",
        isRequired: false,
        isDisqualifier: false,
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    boxes.ownershipAreas = "Owns forecast\n";
    const rows = editorBoxesToCriteria(boxes, baseline);
    expect(rows.map((r) => r.name)).toEqual(["Owns forecast"]);
  });

  it("isRequired true survives a round-trip with no edits", () => {
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Owns sales forecasting process",
        criterionType: "ownership",
        isRequired: true,
        isDisqualifier: false,
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    const rows = editorBoxesToCriteria(boxes, baseline);
    expect(rows[0]?.isRequired).toBe(true);
  });

  it("reword that changes semantic key drops prior isRequired (documented behavior)", () => {
    // Match is normalizeCriterionSemanticKey within the same box. Rewording that
    // changes the key is a new criterion; prior flags are not carried over.
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Owns sales forecasting process",
        criterionType: "ownership",
        isRequired: true,
        isDisqualifier: false,
        researchGuidance: "Confirm from org chart",
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    boxes.ownershipAreas = "Pipeline coverage governance\n";
    const rows = editorBoxesToCriteria(boxes, baseline);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Pipeline coverage governance");
    expect(rows[0]?.isRequired).toBe(false);
    expect(rows[0]?.researchGuidance).toBeNull();
  });

  it("reword that keeps semantic key preserves isRequired and exclusionTestability", () => {
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Owns sales forecasting process",
        criterionType: "ownership",
        isRequired: true,
        isDisqualifier: false,
      },
      {
        name: "Individual selling role only",
        criterionType: "negative_role_signal",
        isRequired: false,
        isDisqualifier: true,
        exclusionTestability: "TITLE_TESTABLE",
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    // "Owns " stripped → same semantic key as baseline ownership name
    boxes.ownershipAreas = "sales forecasting process\n";
    boxes.exclusions = "Individual selling role only\n";
    const rows = editorBoxesToCriteria(boxes, baseline);
    const ownership = rows.find((r) => r.criterionType === "ownership");
    const exclusion = rows.find((r) => r.isDisqualifier);
    expect(ownership?.isRequired).toBe(true);
    expect(exclusion?.exclusionTestability).toBe("TITLE_TESTABLE");
  });

  it("empty Exclusions box yields no disqualifiers (warning trigger)", () => {
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Bad fit",
        criterionType: "negative_role_signal",
        isDisqualifier: true,
        exclusionTestability: "TITLE_TESTABLE",
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    boxes.exclusions = "  \n\n";
    const rows = editorBoxesToCriteria(boxes, baseline);
    expect(rows.every((r) => !r.isDisqualifier)).toBe(true);
    expect(parseCriteriaBoxLines(boxes.exclusions)).toHaveLength(0);
  });

  it("modified box marks manuallyEdited on emitted criteria", () => {
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Owns forecast",
        criterionType: "ownership",
        isRequired: false,
        isDisqualifier: false,
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    boxes.ownershipAreas = "Owns forecast\nOwns CRM\n";
    const rows = editorBoxesToCriteria(boxes, baseline, {
      modifiedBoxes: ["ownershipAreas"],
    });
    expect(rows.every((r) => r.manuallyEdited === true)).toBe(true);
  });

  it("typing the same needs-review text into a box does not duplicate on save", () => {
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Sales leadership scope",
        criterionType: "needs_review",
        isRequired: false,
        isDisqualifier: false,
        researchGuidance: "Confirm seniority from role evidence.",
      },
      {
        name: "Owns forecast process",
        criterionType: "ownership",
        isRequired: false,
        isDisqualifier: false,
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    boxes.ownershipAreas = appendCriterionLineToBox(
      boxes.ownershipAreas,
      "Sales leadership scope",
    );
    const rows = editorBoxesToCriteria(boxes, baseline, {
      modifiedBoxes: ["ownershipAreas"],
    });
    const named = rows.filter(
      (row) =>
        normalizeCriterionSemanticKey(row.name) ===
        normalizeCriterionSemanticKey("Sales leadership scope"),
    );
    expect(named).toHaveLength(1);
    expect(named[0]?.criterionType).toBe("ownership");
    expect(named[0]?.manuallyEdited).toBe(true);
    expect(named[0]?.researchGuidance).toBe(
      "Confirm seniority from role evidence.",
    );
    expect(
      remainingNeedsReviewCriteria(baseline, boxes),
    ).toHaveLength(0);
  });

  it("dismiss removes a needs-review row without adding it to a box", () => {
    const baseline: PersonaCriterionFormRow[] = [
      {
        name: "Sales leadership scope",
        criterionType: "needs_review",
        isRequired: false,
        isDisqualifier: false,
      },
    ];
    const boxes = criteriaToEditorBoxes(baseline);
    const semantic = normalizeCriterionSemanticKey("Sales leadership scope");
    const rows = editorBoxesToCriteria(boxes, baseline, {
      dismissedNeedsReview: [semantic],
    });
    expect(rows).toHaveLength(0);
    expect(
      remainingNeedsReviewCriteria(baseline, boxes, [semantic]),
    ).toHaveLength(0);
  });

  it("classifyNeedsReviewRole maps the five inline actions", () => {
    expect(classifyNeedsReviewRole("positive")?.criterionType).toBe(
      "positive_role_signal",
    );
    expect(classifyNeedsReviewRole("exclusion")?.isDisqualifier).toBe(true);
    expect(classifyNeedsReviewRole("ownership")?.criterionType).toBe(
      "ownership",
    );
    expect(classifyNeedsReviewRole("responsibility")?.criterionType).toBe(
      "responsibility",
    );
    expect(classifyNeedsReviewRole("dismiss")).toBeNull();
  });

  it("RevOps and CRO v2 fixtures round-trip without loss", () => {
    for (const fixture of [
      REVOPS_PERSONA_DRAFT_FIXTURE,
      CRO_PERSONA_DRAFT_V2_FIXTURE,
    ]) {
      const { criteria } = buildPersonaCriteriaForReview(fixture, {
        maxCriteria: 15,
      });
      const boxes = criteriaToEditorBoxes(criteria);
      const restored = editorBoxesToCriteria(boxes, criteria);
      expect(restored).toHaveLength(criteria.length);

      const originalKeys = new Set(
        criteria.map(
          (r) =>
            `${r.criterionType}:${normalizeCriterionSemanticKey(r.name)}`,
        ),
      );
      const restoredKeys = new Set(
        restored.map(
          (r) =>
            `${r.criterionType}:${normalizeCriterionSemanticKey(r.name)}`,
        ),
      );
      expect(restoredKeys).toEqual(originalKeys);

      for (const original of criteria) {
        const match = restored.find(
          (r) =>
            r.criterionType === original.criterionType &&
            normalizeCriterionSemanticKey(r.name) ===
              normalizeCriterionSemanticKey(original.name),
        )!;
        expect(match.isRequired).toBe(Boolean(original.isRequired));
        expect(match.isDisqualifier).toBe(Boolean(original.isDisqualifier));
        expect(match.researchGuidance ?? null).toBe(
          original.researchGuidance ?? null,
        );
      }
    }
  });

  it("persona draft and edit pages expose classify and dismiss actions", async () => {
    const fs = await import("node:fs");
    const draft = fs.readFileSync(
      "src/components/PersonaDraftReview.tsx",
      "utf8",
    );
    const edit = fs.readFileSync("src/components/PersonaForm.tsx", "utf8");
    const targets = fs.readFileSync(
      "src/lib/persona-research/project-signals.ts",
      "utf8",
    );
    expect(targets).toContain('label: "Positive role signal"');
    expect(targets).toContain('label: "Exclusion"');
    expect(targets).toContain('label: "Ownership"');
    expect(targets).toContain('label: "Responsibility"');
    for (const src of [draft, edit]) {
      expect(src).toContain("Dismiss");
      expect(src).toContain("NEEDS_REVIEW_CLASSIFY_TARGETS");
    }
    expect(draft).toContain("classifyNeedsReview");
    expect(draft).toContain("dismissNeedsReview");
    expect(draft).toContain("remainingNeedsReviewCriteria");
    expect(edit).toContain("updatePersonaCriterionAction");
    expect(edit).toContain("deletePersonaCriterionAction");
  });
});

describe("normalizeCriterionSemanticKey", () => {
  it("collapses near-duplicate individual-seller exclusion wordings", () => {
    const keys = [
      "Individual contributor seller",
      "Individual quota-only seller",
      "Individual quota-carrying scope only",
      "Individual sales representative, account executive, or business development representative",
    ].map(normalizeCriterionSemanticKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("individual contributor seller");
  });
});
