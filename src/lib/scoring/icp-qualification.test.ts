import { describe, expect, it } from "vitest";
import { evaluateIcpCriterionWithEvidenceClass } from "@/lib/criteria/targeted-search-eval";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { calculateScoresFromAssessment } from "@/lib/scoring/calculate";
import {
  icpQualificationToBucket,
  icpQualificationWhyLines,
} from "@/lib/scoring/icp-qualification";
import type { AiScoringAssessment } from "@/lib/scoring/assessment";
import type { IcpSnapshot } from "@/lib/scoring/types";

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

const emptyIcpFields = {
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
};

function scoreIcp(input: {
  criteria: CriterionSnapshot[];
  actuals: unknown[];
  aiAssessments?: AiScoringAssessment["dimensions"];
}) {
  const assessments = input.criteria.map((entry, index) =>
    evaluateIcpCriterionWithEvidenceClass({
      criterion: entry,
      actualValue: input.actuals[index],
    }),
  );
  const icp: IcpSnapshot = {
    id: "icp",
    name: "Test ICP",
    ...emptyIcpFields,
    criteria: input.criteria,
  };
  return calculateScoresFromAssessment({
    assessment: {
      dimensions:
        input.aiAssessments ??
        input.criteria.map((entry) => ({
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
      recommendedAction: "review",
      reasoning: "test",
    },
    applicable: input.criteria
      .filter((entry) => entry.tier !== "SECONDARY")
      .map((entry) => ({ component: "ICP" as const, dimension: entry.name })),
    icp,
    criterionEvidenceAssessments: assessments,
  });
}

describe("PRIMARY / SECONDARY ICP qualification", () => {
  const industry = criterion({
    name: "Industry",
    criterionType: "industry",
    dataType: "MULTI_SELECT",
    operator: "IN",
    targetValue: ["B2B"],
    evidenceClass: "LIST_DATA",
    tier: "PRIMARY",
  });
  const hubspot = criterion({
    name: "Uses HubSpot",
    criterionType: "technology",
    dataType: "MULTI_SELECT",
    operator: "IN",
    targetValue: ["HubSpot"],
    evidenceClass: "TARGETED_SEARCH",
    tier: "SECONDARY",
  });

  it("never lets a SECONDARY criterion change the ICP score or bucket", () => {
    const confirmed = scoreIcp({
      criteria: [industry, hubspot],
      actuals: ["B2B", "HubSpot CRM"],
    });
    const contradicted = scoreIcp({
      criteria: [industry, hubspot],
      actuals: ["B2B", "Uses only proprietary tools"],
    });
    const unresolved = scoreIcp({
      criteria: [industry, hubspot],
      actuals: ["B2B", null],
    });

    expect(confirmed.icpScore).toBe(100);
    expect(contradicted.icpScore).toBe(confirmed.icpScore);
    expect(unresolved.icpScore).toBe(confirmed.icpScore);
    expect(confirmed.icpQualification.bucket).toBe("GOOD");
    expect(contradicted.icpQualification.bucket).toBe("GOOD");
    expect(unresolved.icpQualification.bucket).toBe("GOOD");
    expect(confirmed.icpQualification.secondaryFlags).toEqual([
      { name: "Uses HubSpot", text: "Uses HubSpot ✓" },
    ]);
    expect(contradicted.icpQualification.secondaryFlags).toEqual([]);
    expect(unresolved.icpQualification.secondaryFlags).toEqual([]);
    expect(confirmed.componentCoverage.icp).toEqual({ evaluated: 1, total: 1 });
  });

  it("disqualifies on a confirmed mandatory PRIMARY failure", () => {
    const employees = criterion({
      name: "Employee Count",
      criterionType: "employee_count",
      dataType: "NUMBER",
      operator: "GREATER_THAN_OR_EQUAL",
      targetValue: 100,
      evidenceClass: "LIST_DATA",
      tier: "PRIMARY",
      isMandatory: true,
    });
    const result = scoreIcp({
      criteria: [employees],
      actuals: [20],
    });
    expect(result.icpQualification.bucket).toBe("NO");
    expect(result.scoreLabel).toBe("DISQUALIFIED");
    expect(
      icpQualificationToBucket(result.icpQualification, result.scoreLabel),
    ).toBe("EXCLUDED");
  });

  it("treats an unresolved mandatory PRIMARY as MAYBE, never NO", () => {
    const employees = criterion({
      name: "Employee Count",
      criterionType: "employee_count",
      dataType: "NUMBER",
      operator: "GREATER_THAN_OR_EQUAL",
      targetValue: 100,
      evidenceClass: "LIST_DATA",
      tier: "PRIMARY",
      isMandatory: true,
    });
    const result = scoreIcp({
      criteria: [employees],
      actuals: [null],
    });
    expect(result.icpQualification.bucket).toBe("MAYBE");
    expect(result.scoreLabel).not.toBe("DISQUALIFIED");
    expect(
      icpQualificationToBucket(result.icpQualification, result.scoreLabel),
    ).toBe("NEEDS_REVIEW");
  });

  it("disqualifies $10M revenue with 20 confirmed employees when headcount is mandatory", () => {
    const employees = criterion({
      name: "Employee Count",
      criterionType: "employee_count",
      dataType: "NUMBER",
      operator: "GREATER_THAN_OR_EQUAL",
      targetValue: 100,
      evidenceClass: "LIST_DATA",
      tier: "PRIMARY",
      isMandatory: true,
    });
    const revenue = criterion({
      name: "Company Revenue",
      criterionType: "company_revenue",
      dataType: "CURRENCY",
      operator: "GREATER_THAN_OR_EQUAL",
      targetValue: 10_000_000,
      evidenceClass: "LIST_DATA",
      tier: "PRIMARY",
      isMandatory: false,
    });
    const result = scoreIcp({
      criteria: [employees, revenue],
      actuals: [20, 10_000_000],
    });
    expect(result.icpQualification.primaryPassed).toEqual(["Company Revenue"]);
    expect(result.icpQualification.mandatoryFailures).toEqual([
      "Employee Count",
    ]);
    expect(result.icpQualification.bucket).toBe("NO");
    expect(result.scoreLabel).toBe("DISQUALIFIED");
  });

  it("explains passed primaries, unresolved primaries, and secondary signals", () => {
    const confirmed = scoreIcp({
      criteria: [industry, hubspot],
      actuals: ["B2B", "HubSpot CRM"],
    });
    expect(icpQualificationWhyLines(confirmed.icpQualification)).toEqual({
      passed: "Industry",
      unresolved: "None",
      failed: "None",
      failedLines: "None",
      mandatory: null,
      secondary: "Uses HubSpot ✓",
    });
    const unresolved = scoreIcp({
      criteria: [industry, hubspot],
      actuals: [null, null],
    });
    expect(icpQualificationWhyLines(unresolved.icpQualification)).toEqual({
      passed: "None",
      unresolved: "Industry",
      failed: "None",
      failedLines: "None",
      mandatory: null,
      secondary: "None",
    });
  });
});
