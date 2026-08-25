import { describe, expect, it } from "vitest";
import { identifyIcpEvidenceGaps } from "@/lib/contact-research/gaps";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import {
  evaluateCriterionDeterministic,
  resolveCompanyActualWithProvenance,
} from "@/lib/criteria/evaluate";
import {
  isHedgedResearchText,
  isNumericEvidence,
  readCriterionProvenanceLabels,
} from "@/lib/criteria/research-cascade";
import { evaluateIcpCriterionWithEvidenceClass } from "@/lib/criteria/targeted-search-eval";
import { clampFactualAiDimension } from "@/lib/criteria/targeted-search-eval";

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

const employees = criterion({
  name: "Employee Count",
  criterionType: "employee_count",
  dataType: "NUMBER",
  operator: "BETWEEN",
  minValue: 50,
  maxValue: 500,
  evidenceClass: "LIST_DATA",
});

const stoneEagleSize =
  "LinkedIn lists StoneEagle as privately held, with headquarters in Dallas and 201–500 employees.";

describe("research cascade actuals", () => {
  it("resolves blank list headcount from companySizeContext and records the sentence", () => {
    const resolution = resolveCompanyActualWithProvenance(
      employees,
      { employeeCount: null },
      { companySizeContext: stoneEagleSize },
    );
    expect(isNumericEvidence(resolution.value)).toBe(true);
    if (!isNumericEvidence(resolution.value)) return;
    expect(resolution.value).toMatchObject({ min: 201, max: 500, display: "201–500" });
    expect(resolution.provenance).toMatchObject({
      source: "RESEARCH",
      field: "companySizeContext",
      hedged: false,
      label: "Employees: 201–500 (from research)",
    });
    expect(resolution.provenance?.excerpt).toContain("201–500 employees");

    const evaluated = evaluateIcpCriterionWithEvidenceClass({
      criterion: employees,
      actualValue: resolution.value,
      provenance: resolution.provenance,
    });
    expect(evaluated.excludeFromScore).toBe(false);
    expect(["STRONG", "MODERATE"]).toContain(evaluated.assessment);
    expect(evaluated.provenance?.label).toBe(
      "Employees: 201–500 (from research)",
    );
  });

  it("treats hedged research headcount as UNKNOWN, not a guess", () => {
    expect(
      isHedgedResearchText("StoneEagle has approximately 201–500 employees"),
    ).toBe(true);
    const resolution = resolveCompanyActualWithProvenance(
      employees,
      { employeeCount: null },
      {
        companySizeContext:
          "StoneEagle has approximately 201–500 employees based on public profiles.",
      },
    );
    expect(resolution.value).toBeNull();
    expect(resolution.provenance?.hedged).toBe(true);
    expect(resolution.provenance?.label).toContain("hedged research");

    const evaluated = evaluateIcpCriterionWithEvidenceClass({
      criterion: employees,
      actualValue: resolution.value,
      provenance: resolution.provenance,
    });
    expect(evaluated.evidenceOutcome).toBe("UNVERIFIABLE");
    expect(evaluated.excludeFromScore).toBe(true);
  });

  it("prefers list data when both list and research have a value", () => {
    const resolution = resolveCompanyActualWithProvenance(
      employees,
      { employeeCount: 120 },
      { companySizeContext: stoneEagleSize },
    );
    expect(resolution.value).toBe(120);
    expect(resolution.provenance).toMatchObject({
      source: "LIST",
      field: "employeeCount",
      label: "Employees: 120 (from list)",
      excerpt: null,
    });
  });

  it("does not invent a factual result from the scoring model when list and research are blank", () => {
    const evidence = evaluateIcpCriterionWithEvidenceClass({
      criterion: employees,
      actualValue: null,
    });
    const clamped = clampFactualAiDimension({
      dimensionName: "Employee Count",
      aiAssessment: "STRONG",
      evidenceAssessment: evidence,
    });
    expect(evidence.factualAiForbidden).toBe(true);
    expect(clamped.forced).toBe(true);
    expect(clamped.assessment).toBe("UNKNOWN");
  });

  it("resolves industry from businessModel when the list field is blank", () => {
    const industry = criterion({
      name: "Industry",
      criterionType: "industry",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: ["B2B"],
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      industry,
      { industry: null },
      {
        businessModel:
          "Enterprise B2B software/data provider sold through demos and direct sales.",
      },
    );
    expect(resolution.provenance).toMatchObject({
      source: "RESEARCH",
      field: "businessModel",
      label: expect.stringContaining("(from research)"),
    });
    const evaluated = evaluateCriterionDeterministic({
      criterion: industry,
      actualValue: resolution.value,
    });
    expect(evaluated.assessment).toBe("STRONG");
  });

  it("leaves overlapping headcount ranges unresolved instead of picking a midpoint", () => {
    const tight = criterion({
      name: "Employee Count",
      criterionType: "employee_count",
      dataType: "NUMBER",
      operator: "BETWEEN",
      minValue: 50,
      maxValue: 250,
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      tight,
      { employeeCount: null },
      { companySizeContext: stoneEagleSize },
    );
    const evaluated = evaluateCriterionDeterministic({
      criterion: tight,
      actualValue: resolution.value,
    });
    expect(evaluated.assessment).toBe("UNKNOWN");
    expect(evaluated.reasoning).toContain("inconclusive");
  });

  it("does not treat size context as an evidence gap once research answers it", () => {
    const gaps = identifyIcpEvidenceGaps(
      [employees],
      { employeeCount: null },
      {
        id: "r1",
        companySizeContext: stoneEagleSize,
        companySummary: null,
        whatTheySell: null,
        businessModel: null,
        relevantTechnologies: [],
        buyingSignals: [],
        riskSignals: [],
        primaryMarkets: [],
      } as never,
    );
    expect(gaps).toEqual([]);
  });

  it("does not treat B2B copy as a revenue figure", () => {
    const revenue = criterion({
      name: "Company Revenue",
      criterionType: "company_revenue",
      dataType: "CURRENCY",
      operator: "BETWEEN",
      minValue: 10_000_000,
      maxValue: 100_000_000,
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      revenue,
      { revenue: null },
      {
        whatTheySell: "B2B automotive-dealership software and data intelligence.",
        businessModel: "Enterprise B2B software/data provider sold through demos.",
      },
    );
    expect(resolution.value).toBeNull();
    expect(resolution.provenance).toBeNull();
  });

  it("extracts an explicit dollar revenue figure from research", () => {
    const revenue = criterion({
      name: "Company Revenue",
      criterionType: "company_revenue",
      dataType: "CURRENCY",
      operator: "GREATER_THAN_OR_EQUAL",
      targetValue: 10_000_000,
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      revenue,
      { revenue: null },
      { companySummary: "The company reported $25 million in ARR last year." },
    );
    expect(isNumericEvidence(resolution.value)).toBe(true);
    expect(resolution.provenance?.source).toBe("RESEARCH");
    expect(resolution.provenance?.hedged).toBe(false);
    const evaluated = evaluateCriterionDeterministic({
      criterion: revenue,
      actualValue: resolution.value,
    });
    expect(evaluated.assessment).toMatch(/STRONG|MODERATE/);
  });

  it("surfaces provenance labels from stored assessment data", () => {
    expect(
      readCriterionProvenanceLabels({
        criterionAssessments: [
          {
            name: "Employee Count",
            provenance: { label: "Employees: 201–500 (from research)" },
          },
        ],
      }),
    ).toEqual(["Employees: 201–500 (from research)"]);
  });
});
