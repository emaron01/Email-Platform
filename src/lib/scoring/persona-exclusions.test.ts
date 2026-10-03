import { describe, expect, it } from "vitest";
import type { PersonaCriterion } from "@prisma/client";
import {
  SCORING_LOGIC_VERSION_CRITERIA,
  type CriterionSnapshot,
} from "@/lib/criteria/types";
import { getApplicableDimensions } from "@/lib/scoring/dimensions";
import {
  SCORING_LOGIC_VERSION,
  SCORING_PROMPT_VERSION,
} from "@/lib/scoring/config";
import { evaluatePersonaExclusions } from "@/lib/scoring/persona-exclusions";
import { evaluatePersonaTitleGate } from "@/lib/scoring/title-fit";
import { snapshotCriterionRow } from "@/lib/scoring/snapshots";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";

function exclusion(
  testability: "TITLE_TESTABLE" | "EVIDENCE_TESTABLE",
  overrides: Partial<CriterionSnapshot> = {},
): CriterionSnapshot {
  return {
    id: "criterion_1",
    name: "Individual selling role only",
    description: "Exclude account executives without operational ownership.",
    criterionType: "negative_role_signal",
    dataType: "TEXT",
    operator: "EXISTS",
    importance: "CRITICAL",
    isRequired: false,
    isDisqualifier: true,
    exclusionTestability: testability,
    sortOrder: 0,
    ...overrides,
  };
}

describe("persona exclusion evaluation", () => {
  it("confirms TITLE_TESTABLE exclusions from title evidence", () => {
    const result = evaluatePersonaExclusions({
      criteria: [exclusion("TITLE_TESTABLE")],
      title: "Account Executive",
      contactResearch: null,
    });

    expect(result[0]).toMatchObject({
      outcome: "CONFIRMED",
      confidence: "HIGH",
      excludeFromScore: true,
    });
  });

  it("does not exclude a vice president of sales as an individual contributor", () => {
    const result = evaluatePersonaExclusions({
      criteria: [
        exclusion("TITLE_TESTABLE", {
          name: "Individual-contributor-only role",
          description: "Negative role signal — evidence against this buyer role.",
          researchGuidance:
            "Exclude a person whose work is personal sales quota rather than team forecast ownership.",
        }),
      ],
      title: "Vice President - Sales",
      contactResearch: null,
    });

    expect(result[0]?.outcome).toBe("NOT_CONFIRMED");
  });

  it("does not let the CRO exclusion confirm a vice president of sales", () => {
    const result = evaluatePersonaExclusions({
      criteria: [
        exclusion("TITLE_TESTABLE", {
          name: "Chief Revenue Officer or broader revenue executive whose primary accountability is company-wide revenue strategy, executive rollups, and cross-functional ownership rather than weekly sales-team forecast and deal inspection.",
          description: "Negative role signal — evidence against this buyer role.",
          researchGuidance:
            "Use this when the contact owns company-wide revenue rather than the scope of sales team inspection.",
        }),
      ],
      title: "Vice President of Sales",
      contactResearch: null,
    });

    expect(result[0]?.outcome).toBe("NOT_CONFIRMED");
  });

  it("still excludes a sales representative as an individual contributor", () => {
    const result = evaluatePersonaExclusions({
      criteria: [exclusion("TITLE_TESTABLE")],
      title: "Sales Representative",
      contactResearch: null,
    });

    expect(result[0]?.outcome).toBe("CONFIRMED");
  });

  it("still excludes a senior account executive as an individual contributor", () => {
    const result = evaluatePersonaExclusions({
      criteria: [exclusion("TITLE_TESTABLE")],
      title: "Senior Account Executive",
      contactResearch: null,
    });

    expect(result[0]?.outcome).toBe("CONFIRMED");
  });

  it("matches Chris Albery's title to VP of Sales and does not exclude it", () => {
    const gate = evaluatePersonaTitleGate({
      persona: {
        id: "persona_vp",
        name: "VP of Sales",
        targetTitles: ["VP Sales", "Vice President of Sales"],
        criteria: [
          exclusion("TITLE_TESTABLE", {
            id: "ic_only",
            name: "Individual-contributor-only role",
            researchGuidance:
              "Exclude a person whose work is personal sales quota rather than team forecast ownership.",
          }),
          exclusion("TITLE_TESTABLE", {
            id: "cro_scope",
            name: "Chief Revenue Officer or broader revenue executive whose primary accountability is company-wide revenue strategy, executive rollups, and cross-functional ownership rather than weekly sales-team forecast and deal inspection.",
          }),
        ],
      },
      contactTitle: "Vice President - Sales",
      applyPositiveFit: true,
    });

    expect(gate.status).toBe("CANDIDATE");
    expect(gate.matchedTitle).toBe("VP Sales");
  });

  it("does not penalize a TITLE_TESTABLE exclusion that title does not confirm", () => {
    const result = evaluatePersonaExclusions({
      criteria: [exclusion("TITLE_TESTABLE")],
      title: "VP Revenue Operations",
      contactResearch: null,
    });

    expect(result[0]).toMatchObject({
      outcome: "NOT_CONFIRMED",
      excludeFromScore: true,
    });
  });

  it("leaves EVIDENCE_TESTABLE exclusions unknown without evidence", () => {
    const result = evaluatePersonaExclusions({
      criteria: [exclusion("EVIDENCE_TESTABLE")],
      title: "VP Sales",
      contactResearch: null,
    });

    expect(result[0]).toMatchObject({
      outcome: "UNKNOWN",
      confidence: "LOW",
      evidence: [],
      excludeFromScore: true,
    });
  });

  it("confirms EVIDENCE_TESTABLE exclusions only from sufficiently confident negative evidence", () => {
    const result = evaluatePersonaExclusions({
      criteria: [
        exclusion("EVIDENCE_TESTABLE", {
          name: "CRM administration without forecast ownership",
        }),
      ],
      title: "Revenue Operations Manager",
      contactResearch: {
        status: "COMPLETED",
        confidence: "MEDIUM",
        roleSummary: "Administers CRM configuration.",
        responsibilities: ["Handles support tickets"],
        ownershipAreas: ["CRM configuration"],
        professionalSignals: [],
        negativeRoleSignals: ["CRM administration without forecast ownership"],
        researchedAt: "2026-08-24T00:00:00.000Z",
      },
    });

    expect(result[0]).toMatchObject({
      outcome: "CONFIRMED",
      confidence: "MEDIUM",
      evidence: ["CRM administration without forecast ownership"],
    });
  });

  it("copies exclusionTestability into immutable criterion snapshots", () => {
    const row = {
      ...exclusion("TITLE_TESTABLE"),
      organizationId: "org_1",
      personaId: "persona_1",
      targetValue: null,
      minValue: null,
      maxValue: null,
      allowedValues: null,
      researchGuidance: null,
      source: "AI_INTERPRETED",
      confidence: "HIGH",
      manuallyEdited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PersonaCriterion;

    expect(snapshotCriterionRow(row).exclusionTestability).toBe(
      "TITLE_TESTABLE",
    );
  });

  it("removes persona exclusions from score averages", () => {
    const persona: PersonaSnapshot = {
      id: "persona_1",
      name: "Revenue Operations",
      definition: null,
      targetTitles: ["VP Revenue Operations"],
      department: null,
      seniority: null,
      responsibilities: null,
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
      criteria: [
        exclusion("EVIDENCE_TESTABLE"),
        {
          ...exclusion("EVIDENCE_TESTABLE"),
          id: "positive_1",
          name: "Forecast ownership",
          isDisqualifier: false,
          exclusionTestability: null,
        },
      ],
    };
    const icp: IcpSnapshot = {
      id: "icp_1",
      name: "ICP",
      description: null,
      definition: null,
      targetIndustries: null,
      minEmployees: null,
      maxEmployees: null,
      minRevenue: null,
      maxRevenue: null,
      targetGeographies: null,
      requiredTechnologies: null,
      positiveSignals: null,
      negativeSignals: null,
      notes: null,
      criteria: [],
    };
    const product: ProductSnapshot = {
      id: "product_1",
      name: "Product",
      description: null,
      valueProposition: null,
      averageOrderValue: null,
      websiteUrl: null,
    };

    const dimensions = getApplicableDimensions({ icp, persona, product });
    expect(dimensions).not.toContainEqual({
      component: "PERSONA",
      dimension: "Individual selling role only",
    });
    expect(dimensions).toContainEqual({
      component: "PERSONA",
      dimension: "Forecast ownership",
    });
  });

  it("bumps scoring versions with persona exclusion behavior", () => {
    expect(SCORING_PROMPT_VERSION).toBe("5");
    expect(SCORING_LOGIC_VERSION).toBe("8");
    expect(SCORING_LOGIC_VERSION_CRITERIA).toBe("5");
  });
});
