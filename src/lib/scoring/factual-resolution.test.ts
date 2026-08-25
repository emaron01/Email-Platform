import { describe, expect, it } from "vitest";
import {
  evaluateIcpCriterionWithEvidenceClass,
  omitFactualIcpDimensionsForAi,
  overlayFactualAiDimension,
} from "@/lib/criteria/targeted-search-eval";
import { NUMERIC_EVIDENCE_KIND } from "@/lib/criteria/research-cascade";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { calculateScoresFromAssessment } from "@/lib/scoring/calculate";
import {
  icpQualificationToBucket,
} from "@/lib/scoring/icp-qualification";
import { collectMandatorySuggestions } from "@/lib/scoring/mandatory-suggestion";
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
    evidenceClass: "LIST_DATA",
    tier: "PRIMARY",
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

function scoreFactual(input: {
  criteria: CriterionSnapshot[];
  actuals: unknown[];
  provenances?: Array<{
    source: "LIST" | "RESEARCH";
    field: string;
    excerpt: string | null;
    displayValue: string;
    label: string;
    hedged: boolean;
  } | null>;
  aiAssessments?: AiScoringAssessment["dimensions"];
}) {
  const assessments = input.criteria.map((entry, index) =>
    evaluateIcpCriterionWithEvidenceClass({
      criterion: entry,
      actualValue: input.actuals[index],
      provenance: input.provenances?.[index] ?? null,
    }),
  );
  const icp: IcpSnapshot = {
    id: "icp",
    name: "Test ICP",
    ...emptyIcpFields,
    criteria: input.criteria,
  };
  return {
    assessments,
    result: calculateScoresFromAssessment({
      assessment: {
        dimensions:
          input.aiAssessments ??
          input.criteria.map((entry) => ({
            dimension: entry.name,
            component: "ICP" as const,
            assessment: "NO_FIT" as const,
            evidence: [],
            concerns: ["No data provided in the contact or company data."],
            confidence: "LOW" as const,
          })),
        fitStrengths: [],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "review",
        reasoning: "test",
      },
      applicable: input.criteria.map((entry) => ({
        component: "ICP" as const,
        dimension: entry.name,
      })),
      icp,
      criterionEvidenceAssessments: assessments,
    }),
  };
}

describe("confirmed factual resolution vs AI contradiction", () => {
  const headcount = criterion({
    id: "c-headcount",
    name: "Size band",
    criterionType: "custom_count",
    dataType: "NUMBER",
    operator: "BETWEEN",
    minValue: 50,
    maxValue: 500,
  });

  it("a numeric criterion resolved from research outside its range reports the value, marks a confirmed failure, and does not report no data or LOW confidence", () => {
    const provenance = {
      source: "RESEARCH" as const,
      field: "companySizeContext",
      excerpt: "Public filings list 7,200+ people on the payroll.",
      displayValue: "7,200+",
      label: "Size band: 7,200+ (from research)",
      hedged: false,
    };
    const { assessments, result } = scoreFactual({
      criteria: [headcount],
      actuals: [
        {
          kind: NUMERIC_EVIDENCE_KIND,
          min: 7200,
          max: null,
          display: "7,200+",
        },
      ],
      provenances: [provenance],
    });

    expect(assessments[0]?.assessment).toBe("NO_FIT");
    expect(assessments[0]?.evidenceOutcome).toBe("CONTRADICTED");
    expect(assessments[0]?.confidence).toBe("HIGH");
    expect(assessments[0]?.confirmedFailureLine).toContain("7,200+");
    expect(assessments[0]?.confirmedFailureLine).toContain("outside 50–500");
    expect(assessments[0]?.confirmedFailureLine).not.toMatch(/no data/i);

    const dim = result.dimensions.find((row) => row.dimension === headcount.name);
    expect(dim?.assessment).toBe("NO_FIT");
    expect(dim?.confidence).toBe("HIGH");
    expect(dim?.concerns.join(" ")).not.toMatch(/no data/i);
    expect(result.icpQualification.bucket).toBe("WEAK");
    expect(result.scoreLabel).toBe("POOR");
    expect(
      icpQualificationToBucket(result.icpQualification, result.scoreLabel),
    ).toBe("POOR_FIT");
  });

  it("a currency-range criterion behaves identically", () => {
    const revenue = criterion({
      id: "c-rev",
      name: "Spend band",
      criterionType: "custom_currency",
      dataType: "CURRENCY",
      operator: "BETWEEN",
      minValue: 1_000_000,
      maxValue: 5_000_000,
    });
    const { assessments, result } = scoreFactual({
      criteria: [revenue],
      actuals: [
        {
          kind: NUMERIC_EVIDENCE_KIND,
          min: 25_000_000,
          max: 25_000_000,
          display: "25000000",
        },
      ],
      provenances: [
        {
          source: "RESEARCH",
          field: "companySummary",
          excerpt: "Reported 25000000 last year.",
          displayValue: "25000000",
          label: "Spend band: 25000000 (from research)",
          hedged: false,
        },
      ],
    });
    expect(assessments[0]?.assessment).toBe("NO_FIT");
    expect(assessments[0]?.confidence).toBe("HIGH");
    expect(assessments[0]?.confirmedFailureLine).toContain("outside 1000000–5000000");
    expect(result.dimensions[0]?.concerns.join(" ")).not.toMatch(/no data/i);
    expect(result.icpQualification.bucket).toBe("WEAK");
  });

  it("an enumeration criterion with a confirmed non-matching value behaves identically", () => {
    const vertical = criterion({
      id: "c-enum",
      name: "Vertical",
      criterionType: "custom_enum",
      dataType: "MULTI_SELECT",
      operator: "IN",
      targetValue: ["SaaS", "B2B"],
    });
    const { assessments, result } = scoreFactual({
      criteria: [vertical],
      actuals: ["Hospitality and leisure"],
      provenances: [
        {
          source: "LIST",
          field: "industry",
          excerpt: null,
          displayValue: "Hospitality and leisure",
          label: "Vertical: Hospitality and leisure (from your list)",
          hedged: false,
        },
      ],
    });
    expect(assessments[0]?.assessment).toBe("NO_FIT");
    expect(assessments[0]?.evidenceOutcome).toBe("CONTRADICTED");
    expect(assessments[0]?.confidence).toBe("HIGH");
    expect(result.scoreLabel).not.toBe("FAIR");
    expect(result.icpQualification.bucket).not.toBe("MAYBE");
  });

  it("a confirmed failure on a MANDATORY primary excludes the company", () => {
    const { result } = scoreFactual({
      criteria: [{ ...headcount, isMandatory: true }],
      actuals: [7200],
    });
    expect(result.icpQualification.bucket).toBe("NO");
    expect(result.scoreLabel).toBe("DISQUALIFIED");
    expect(
      icpQualificationToBucket(result.icpQualification, result.scoreLabel),
    ).toBe("EXCLUDED");
  });

  it("a confirmed failure on a non-mandatory primary does not produce Maybe", () => {
    const { result } = scoreFactual({
      criteria: [headcount],
      actuals: [7200],
    });
    expect(result.icpQualification.bucket).toBe("WEAK");
    expect(result.scoreLabel).toBe("POOR");
    expect(result.scoreLabel).not.toBe("FAIR");
  });

  it("an UNRESOLVED criterion still produces Maybe with no penalty", () => {
    const { result } = scoreFactual({
      criteria: [headcount],
      actuals: [null],
    });
    expect(result.icpQualification.bucket).toBe("MAYBE");
    expect(result.icpQualification.primaryFailed).toEqual([]);
    expect(result.dimensions[0]?.assessment).toBe("UNKNOWN");
    expect(result.componentCoverage.icp.evaluated).toBe(0);
    expect(result.scoreLabel).not.toBe("DISQUALIFIED");
    expect(
      icpQualificationToBucket(result.icpQualification, result.scoreLabel),
    ).toBe("NEEDS_REVIEW");
  });

  it("the AI cannot produce a dimension assessment that contradicts a deterministically resolved factual criterion", () => {
    const evidence = evaluateIcpCriterionWithEvidenceClass({
      criterion: headcount,
      actualValue: 7200,
      provenance: {
        source: "RESEARCH",
        field: "companySizeContext",
        excerpt: "Headcount is 7200.",
        displayValue: "7200",
        label: "Size band: 7200 (from research)",
        hedged: false,
      },
    });
    const overlaid = overlayFactualAiDimension({
      dimension: {
        dimension: headcount.name,
        component: "ICP",
        assessment: "NO_FIT",
        evidence: [],
        concerns: ["No employee count is provided in the contact or company data."],
        confidence: "LOW",
      },
      evidenceAssessment: evidence,
    });
    expect(overlaid.assessment).toBe("NO_FIT");
    expect(overlaid.confidence).toBe("HIGH");
    expect(overlaid.concerns.join(" ")).not.toMatch(/no data|not provided/i);
    expect(overlaid.concerns.join(" ")).toContain("7200");

    const omitted = omitFactualIcpDimensionsForAi(
      [
        { component: "ICP", dimension: headcount.name },
        { component: "PERSONA", dimension: "Title Match" },
      ],
      [evidence],
    );
    expect(omitted).toEqual([{ component: "PERSONA", dimension: "Title Match" }]);
  });

  it("the mandatory suggestion fires on a confirmed failure and not on an unresolved one", () => {
    const failed = evaluateIcpCriterionWithEvidenceClass({
      criterion: headcount,
      actualValue: 7200,
    });
    const unresolved = evaluateIcpCriterionWithEvidenceClass({
      criterion: headcount,
      actualValue: null,
    });
    const onFailure = collectMandatorySuggestions({
      criteria: [headcount],
      scores: [
        { companyKey: "co-1", criterionAssessments: [failed] },
        { companyKey: "co-2", criterionAssessments: [failed] },
        { companyKey: "co-3", criterionAssessments: [failed] },
      ],
    });
    expect(onFailure).toHaveLength(1);
    expect(onFailure[0]?.failedCompanyCount).toBe(3);
    expect(onFailure[0]?.prompt).toContain(headcount.name);
    expect(onFailure[0]?.prompt).toMatch(/Make this mandatory/i);
    expect(onFailure[0]?.prompt).not.toMatch(/Employee Count|employees|USD|\$/i);

    const onUnresolved = collectMandatorySuggestions({
      criteria: [headcount],
      scores: [{ companyKey: "co-1", criterionAssessments: [unresolved] }],
    });
    expect(onUnresolved).toEqual([]);

    const alreadyMandatory = collectMandatorySuggestions({
      criteria: [{ ...headcount, isMandatory: true }],
      scores: [{ companyKey: "co-1", criterionAssessments: [failed] }],
    });
    expect(alreadyMandatory).toEqual([]);
  });
});
