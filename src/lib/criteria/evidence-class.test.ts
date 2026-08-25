/**
 * ICP evidence classing, multi-value IN fix, TARGETED_SEARCH asymmetry, caps, approval.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildEvidenceClassSummary,
  checkTargetedSearchCap,
  criterionMaterialFingerprint,
  inferEvidenceClassFromCriterion,
  isTargetedSearchDecisionStale,
  normalizeEvidenceClass,
} from "@/lib/criteria/evidence-class";
import {
  normalizeInOperatorValues,
  splitEmbeddedListValue,
} from "@/lib/criteria/multi-value";
import {
  clampFactualAiDimension,
  evaluateIcpCriterionWithEvidenceClass,
} from "@/lib/criteria/targeted-search-eval";
import {
  calculateComponentScores,
  calculateScoresFromAssessment,
} from "@/lib/scoring/calculate";
import { ICP_INTERPRETATION_PROMPT_VERSION } from "@/lib/criteria/types";
import { parseIcpInterpretedCriteria } from "@/lib/interpretation/schema";
import type { CriterionSnapshot } from "@/lib/criteria/types";

function criterion(
  overrides: Partial<CriterionSnapshot> & Pick<CriterionSnapshot, "name">,
): CriterionSnapshot {
  return {
    criterionType: overrides.criterionType ?? "custom",
    dataType: overrides.dataType ?? "TEXT",
    operator: overrides.operator ?? "EQUALS",
    importance: overrides.importance ?? "MEDIUM",
    isRequired: overrides.isRequired ?? false,
    isDisqualifier: overrides.isDisqualifier ?? false,
    sortOrder: overrides.sortOrder ?? 0,
    ...overrides,
  };
}

describe("evidence class normalize + infer", () => {
  it('classes "Uses Salesforce or HubSpot" as TARGETED_SEARCH and splits allowed values', () => {
    const evidenceClass = inferEvidenceClassFromCriterion({
      name: "Required Technologies",
      criterionType: "technology",
      description: "Uses Salesforce or HubSpot",
    });
    expect(evidenceClass).toBe("TARGETED_SEARCH");

    const split = normalizeInOperatorValues({
      operator: "IN",
      dataType: "MULTI_SELECT",
      targetValue: ["salesforce.com or hubspot CRM"],
    });
    expect(split.splitPerformed).toBe(true);
    expect(split.targetValue).toEqual(["salesforce.com", "hubspot CRM"]);
    expect(split.allowedValues).toEqual(["salesforce.com", "hubspot CRM"]);
  });

  it('classes "Between 50 and 500 employees" as LIST_DATA', () => {
    expect(
      inferEvidenceClassFromCriterion({
        name: "Employee Count",
        criterionType: "employee_count",
        description: "Between 50 and 500 employees",
      }),
    ).toBe("LIST_DATA");
  });

  it("defaults missing or unrecognized class to TARGETED_SEARCH", () => {
    expect(normalizeEvidenceClass(undefined)).toBe("TARGETED_SEARCH");
    expect(normalizeEvidenceClass(null)).toBe("TARGETED_SEARCH");
    expect(normalizeEvidenceClass("NOT_A_REAL_CLASS")).toBe("TARGETED_SEARCH");
    expect(normalizeEvidenceClass("list_data")).toBe("LIST_DATA");
  });

  it("splits embedded or/and/, lists", () => {
    expect(splitEmbeddedListValue("salesforce.com or hubspot CRM")).toEqual([
      "salesforce.com",
      "hubspot CRM",
    ]);
    expect(splitEmbeddedListValue("a, b, and c")).toEqual(["a", "b", "c"]);
  });
});

describe("evidence class summary (production ICP)", () => {
  it("counts the production ICP correctly", () => {
    const summary = buildEvidenceClassSummary([
      { evidenceClass: "LIST_DATA" },
      { evidenceClass: "LIST_DATA" },
      { evidenceClass: "LIST_DATA" },
      { evidenceClass: "TARGETED_SEARCH" },
    ]);
    expect(summary).toMatch(/3 of 4 criteria come from your list/i);
    expect(summary).toMatch(/1 may not be verifiable online/i);
  });
});

describe("user override fingerprint / material change", () => {
  it("user class override fingerprint survives when text is unchanged", () => {
    const base = {
      name: "Required Technologies",
      description: "CRM stack",
      criterionType: "technology",
      evidenceClass: "TARGETED_SEARCH" as const,
      operator: "IN",
      targetValue: ["Salesforce", "HubSpot"],
    };
    const fp = criterionMaterialFingerprint(base);
    expect(
      isTargetedSearchDecisionStale({
        decision: "KEEP_ASYMMETRIC",
        storedFingerprint: fp,
        currentFingerprint: criterionMaterialFingerprint(base),
      }),
    ).toBe(false);
  });

  it("material text change invalidates approval; unrelated importance alone does not", () => {
    const before = criterionMaterialFingerprint({
      name: "Required Technologies",
      description: "CRM stack",
      criterionType: "technology",
      evidenceClass: "TARGETED_SEARCH",
      operator: "IN",
      targetValue: ["Salesforce"],
    });
    const afterName = criterionMaterialFingerprint({
      name: "Required Technologies (updated)",
      description: "CRM stack",
      criterionType: "technology",
      evidenceClass: "TARGETED_SEARCH",
      operator: "IN",
      targetValue: ["Salesforce"],
    });
    expect(
      isTargetedSearchDecisionStale({
        decision: "KEEP_ASYMMETRIC",
        storedFingerprint: before,
        currentFingerprint: afterName,
      }),
    ).toBe(true);

    // Fingerprint ignores importance / isRequired — those are not material for re-prompt.
    expect(before).toBe(
      criterionMaterialFingerprint({
        name: "Required Technologies",
        description: "CRM stack",
        criterionType: "technology",
        evidenceClass: "TARGETED_SEARCH",
        operator: "IN",
        targetValue: ["Salesforce"],
      }),
    );
  });

  it("locked evidence class is preserved in interpret merge path (source seam)", () => {
    const src = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(src).toContain("applyLockedEvidenceClass");
    expect(src).toContain("evidenceClassLocked");
  });
});

describe("TARGETED_SEARCH asymmetry", () => {
  const targeted = criterion({
    name: "Required Technologies",
    criterionType: "technology",
    dataType: "MULTI_SELECT",
    operator: "IN",
    targetValue: ["Salesforce", "HubSpot"],
    isRequired: true,
    evidenceClass: "TARGETED_SEARCH",
  });

  it("no evidence → UNVERIFIABLE, excluded from score, not a fail", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: null,
    });
    expect(result.evidenceOutcome).toBe("UNVERIFIABLE");
    expect(result.assessment).toBe("NEUTRAL");
    expect(result.excludeFromScore).toBe(true);

    const components = calculateComponentScores(
      [
        {
          dimension: "Required Technologies",
          component: "ICP",
          assessment: "NO_FIT",
          evidence: [],
          concerns: [],
          confidence: "HIGH",
        },
        {
          dimension: "Industry",
          component: "ICP",
          assessment: "STRONG",
          evidence: [],
          concerns: [],
          confidence: "HIGH",
        },
      ],
      { excludeIcpDimensionNames: new Set(["Required Technologies"]) },
    );
    expect(components.icpScore).toBe(100);
  });

  it("confirming evidence → CONFIRMED positive contribution", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: "Company uses HubSpot CRM extensively",
    });
    expect(result.evidenceOutcome).toBe("CONFIRMED");
    expect(result.excludeFromScore).toBe(false);
    expect(["STRONG", "MODERATE"]).toContain(result.assessment);
  });

  it("unrelated discovered technologies are absence, not contradiction", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue:
        "DMS analytics, workflow tooling, benchmarking, and FusionAuth",
    });
    expect(result).toMatchObject({
      evidenceOutcome: "UNVERIFIABLE",
      assessment: "NEUTRAL",
      excludeFromScore: true,
    });
  });

  it("contradicting evidence → CONTRADICTED / normal negative", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: "Uses only proprietary internal tools",
    });
    expect(result.evidenceOutcome).toBe("CONTRADICTED");
    expect(result.excludeFromScore).toBe(false);
    expect(["NO_FIT", "WEAK"]).toContain(result.assessment);
  });

  it("does not mistake a negated target mention for confirming evidence", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: targeted,
      actualValue: "The company does not use Salesforce and uses Dynamics.",
    });
    expect(result).toMatchObject({
      evidenceOutcome: "CONTRADICTED",
      assessment: "NO_FIT",
      excludeFromScore: false,
    });
  });

  it("missing LIST_DATA is unresolvable and excluded from scoring", () => {
    const result = evaluateIcpCriterionWithEvidenceClass({
      criterion: criterion({
        name: "Employee Count",
        criterionType: "employee_count",
        dataType: "NUMBER",
        operator: "BETWEEN",
        minValue: 50,
        maxValue: 500,
        evidenceClass: "LIST_DATA",
      }),
      actualValue: null,
    });
    expect(result).toMatchObject({
      evidenceOutcome: "UNVERIFIABLE",
      assessment: "NEUTRAL",
      excludeFromScore: true,
    });
  });
});

describe("factual AI guard", () => {
  it("AI assessment cannot satisfy a LIST_DATA / TARGETED_SEARCH criterion", () => {
    const factual = evaluateIcpCriterionWithEvidenceClass({
      criterion: criterion({
        name: "Industry",
        criterionType: "industry",
        dataType: "MULTI_SELECT",
        operator: "IN",
        targetValue: ["SaaS"],
        evidenceClass: "LIST_DATA",
      }),
      actualValue: null,
    });
    expect(factual.factualAiForbidden).toBe(true);

    const clamped = clampFactualAiDimension({
      dimensionName: "Industry",
      aiAssessment: "STRONG",
      evidenceAssessment: {
        ...factual,
        evidenceOutcome: "UNVERIFIABLE",
        excludeFromScore: true,
        factualAiForbidden: true,
        assessment: "NEUTRAL",
        method: "ASYMMETRIC",
      },
    });
    expect(clamped.forced).toBe(true);
    expect(clamped.assessment).toBe("UNKNOWN");
  });

  it("calculateScoresFromAssessment clamps factual AI STRONG when unverifiable", () => {
    const result = calculateScoresFromAssessment({
      assessment: {
        dimensions: [
          {
            dimension: "Required Technologies",
            component: "ICP",
            assessment: "STRONG",
            evidence: ["model invented this"],
            concerns: [],
            confidence: "HIGH",
          },
        ],
        fitStrengths: [],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "review",
        reasoning: "test",
      },
      applicable: [
        {
          dimension: "Required Technologies",
          component: "ICP",
        },
      ],
      icp: {
        id: "icp",
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
      },
      criterionEvidenceAssessments: [
        {
          scope: "ICP",
          name: "Required Technologies",
          evidenceClass: "TARGETED_SEARCH",
          assessment: "NEUTRAL",
          confidence: "LOW",
          method: "ASYMMETRIC",
          reasoning: "unverifiable",
          evidenceOutcome: "UNVERIFIABLE",
          excludeFromScore: true,
          factualAiForbidden: true,
        },
      ],
    });
    expect(result.dimensions[0]?.assessment).toBe("UNKNOWN");
    // Excluded from ICP average → neutral 50 component default when no scored dims.
    expect(result.icpScore).toBe(50);
    expect(result.componentCoverage.icp).toEqual({ evaluated: 0, total: 1 });
    expect(result.scoreLabel).toBe("FAIR");
  });

  it("scores one passing ICP criterion while excluding three unresolvable criteria", () => {
    const criteria = [
      criterion({
        id: "industry",
        name: "Industry",
        criterionType: "industry",
        dataType: "MULTI_SELECT",
        operator: "IN",
        targetValue: ["SaaS", "B2B"],
        evidenceClass: "LIST_DATA",
        isRequired: true,
      }),
      criterion({
        id: "employees",
        name: "Employee Count",
        criterionType: "employee_count",
        dataType: "NUMBER",
        operator: "BETWEEN",
        minValue: 50,
        maxValue: 500,
        evidenceClass: "LIST_DATA",
      }),
      criterion({
        id: "revenue",
        name: "Company Revenue",
        criterionType: "company_revenue",
        dataType: "CURRENCY",
        operator: "BETWEEN",
        minValue: 10_000_000,
        maxValue: 100_000_000,
        evidenceClass: "LIST_DATA",
      }),
      criterion({
        id: "technologies",
        name: "Required Technologies",
        criterionType: "technology",
        dataType: "MULTI_SELECT",
        operator: "IN",
        targetValue: ["Salesforce", "HubSpot"],
        evidenceClass: "TARGETED_SEARCH",
        isRequired: true,
      }),
    ];
    const actualValues = [
      "B2B SaaS",
      null,
      null,
      "DMS analytics, workflow tooling, benchmarking, and FusionAuth",
    ];
    const criterionEvidenceAssessments = criteria.map((entry, index) =>
      evaluateIcpCriterionWithEvidenceClass({
        criterion: entry,
        actualValue: actualValues[index],
      }),
    );

    const result = calculateScoresFromAssessment({
      assessment: {
        dimensions: criteria.map((entry) => ({
          dimension: entry.name,
          component: "ICP" as const,
          assessment: "STRONG" as const,
          evidence: [],
          concerns: [],
          confidence: "HIGH" as const,
        })),
        fitStrengths: [],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "Review the evidence gaps.",
        reasoning: "One criterion is confirmed.",
      },
      applicable: criteria.map((entry) => ({
        component: "ICP" as const,
        dimension: entry.name,
      })),
      icp: {
        id: "primary-target",
        name: "Primary Target",
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
        criteria,
      },
      criterionEvidenceAssessments,
    });

    expect(result.icpScore).toBe(100);
    expect(result.componentCoverage.icp).toEqual({ evaluated: 1, total: 4 });
    expect(result.scoreLabel).toBe("FAIR");
    expect(result.fitRisks).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Employee Count"),
        expect.stringContaining("Company Revenue"),
        expect.stringContaining("Required Technologies"),
      ]),
    );
  });
});

describe("cap enforcement", () => {
  it("four TARGETED_SEARCH against cap of 3 blocks with named excess; nothing dropped", () => {
    const criteria = [
      { name: "CRM", evidenceClass: "TARGETED_SEARCH" as const },
      { name: "Buildings", evidenceClass: "TARGETED_SEARCH" as const },
      { name: "Certifications", evidenceClass: "TARGETED_SEARCH" as const },
      { name: "Fleet", evidenceClass: "TARGETED_SEARCH" as const },
    ];
    const cap = checkTargetedSearchCap({ criteria, maxAllowed: 3 });
    expect(cap.ok).toBe(false);
    if (!cap.ok) {
      expect(cap.exceedingNames).toEqual(["Fleet"]);
      expect(cap.message).toContain('"Fleet"');
      expect(cap.message).toContain("limit 3");
    }
    expect(criteria).toHaveLength(4);
  });
});

describe("ICP interpretation prose + definition isolation", () => {
  it("parses a prose read-back without a rewritten definition field", () => {
    const parsed = parseIcpInterpretedCriteria({
      understoodSummary:
        "You want mid-market SaaS companies with a CRM already in place.",
      undetermined: [
        "Preferred CRM brand mix when both Salesforce and HubSpot appear",
      ],
      criteria: [
        {
          name: "Industry",
          criterionType: "industry",
          dataType: "MULTI_SELECT",
          operator: "IN",
          targetValue: ["SaaS"],
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
    });
    expect(parsed.understoodSummary).toMatch(/mid-market SaaS/);
    expect(parsed.undetermined[0]).toMatch(/CRM/);
    expect(parsed).not.toHaveProperty("definition");
  });

  it("interpretation persist path never writes Icp.definition", () => {
    const src = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(src).toMatch(
      /icp\.definition\?\.trim\(\) \|\| icp\.description\?\.trim\(\)/,
    );
    expect(src).toContain(
      "interpretationSummary: parsed.understoodSummary.trim()",
    );
    expect(src).not.toMatch(/data:\s*\{[\s\S]{0,400}definition:/);
  });
});

describe("prompt version + UI seams", () => {
  it("ICP interpretation prompt version is 3 and asserted in prompt builder", () => {
    expect(ICP_INTERPRETATION_PROMPT_VERSION).toBe("3");
    const icp = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(icp).toContain("TARGETED_SEARCH");
    expect(icp).toContain("Uses Salesforce or HubSpot");
    expect(icp).toContain("array of discrete");
    expect(icp).toContain("understoodSummary");
    expect(icp).not.toMatch(/data:\s*\{[\s\S]*definition:/);
    const types = readFileSync("src/lib/criteria/types.ts", "utf8");
    expect(types).toContain('ICP_INTERPRETATION_PROMPT_VERSION = "3"');
  });

  it("criteria review UI surfaces summary, targeted section, and decisions", () => {
    const ui = readFileSync("src/components/IcpCriteriaReview.tsx", "utf8");
    expect(ui).toContain('data-testid="evidence-class-summary"');
    expect(ui).toContain('data-testid="targeted-search-section"');
    expect(ui).toContain('data-testid="required-targeted-warning"');
    expect(ui).toContain("KEEP_ASYMMETRIC");
    expect(ui).toContain("MAKE_SUPPORTING");
    expect(ui).toContain("REMOVE");
    expect(ui).toContain("expectation-line");
    expect(ui).toContain('data-testid="icp-interpretation-prose"');
    expect(ui).toContain("Could not be determined from available data");
  });

  it("MAKE_SUPPORTING demote only clears isRequired via decide action", () => {
    const actions = readFileSync("src/app/actions/interpretation.ts", "utf8");
    expect(actions).toContain("decideIcpTargetedSearchAction");
    expect(actions).toContain('decision === "MAKE_SUPPORTING" ? false');
  });
});
