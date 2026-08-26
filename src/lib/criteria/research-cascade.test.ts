import { describe, expect, it } from "vitest";
import { identifyIcpEvidenceGaps } from "@/lib/contact-research/gaps";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import { evaluateCriterionDeterministic } from "@/lib/criteria/evaluate";
import {
  isHedgedResearchText,
  isNumericEvidence,
  readCriterionProvenanceLabels,
  resolveCompanyActualWithProvenance,
} from "@/lib/criteria/research-cascade";
import { evaluateIcpCriterionWithEvidenceClass, clampFactualAiDimension } from "@/lib/criteria/targeted-search-eval";

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

/** Domain A: independent schools. No shared vocabulary with domain B. */
const enrolledStudents = criterion({
  name: "Enrolled students",
  criterionType: "enrollment_band",
  dataType: "NUMBER",
  operator: "BETWEEN",
  minValue: 200,
  maxValue: 800,
  evidenceClass: "LIST_DATA",
});

const schoolSizeProse =
  "The registrar lists the academy as 420–610 enrolled students on the current campus.";

/** Domain B: municipal utilities. No shared vocabulary with domain A. */
const rateBase = criterion({
  name: "Rate base",
  criterionType: "capital_base",
  dataType: "CURRENCY",
  operator: "GREATER_THAN_OR_EQUAL",
  targetValue: 10_000_000,
  evidenceClass: "LIST_DATA",
});

describe("research cascade actuals — independent schools", () => {
  it("resolves a NUMBER criterion from research prose without list data", () => {
    const resolution = resolveCompanyActualWithProvenance(
      enrolledStudents,
      { employeeCount: null },
      { companySizeContext: schoolSizeProse },
    );
    expect(isNumericEvidence(resolution.value)).toBe(true);
    if (!isNumericEvidence(resolution.value)) return;
    expect(resolution.value).toMatchObject({
      min: 420,
      max: 610,
      display: "420–610",
    });
    expect(resolution.provenance).toMatchObject({
      source: "RESEARCH",
      field: "companySizeContext",
      hedged: false,
      label: "Enrolled students: 420–610 (from research)",
    });
    expect(resolution.provenance?.excerpt).toContain("420–610");

    const evaluated = evaluateIcpCriterionWithEvidenceClass({
      criterion: enrolledStudents,
      actualValue: resolution.value,
      provenance: resolution.provenance,
    });
    expect(evaluated.excludeFromScore).toBe(false);
    expect(["STRONG", "MODERATE"]).toContain(evaluated.assessment);
  });

  it("treats hedged numeric research as unresolved, not a guess", () => {
    expect(
      isHedgedResearchText("approximately 420–610 enrolled students"),
    ).toBe(true);
    const resolution = resolveCompanyActualWithProvenance(
      enrolledStudents,
      { employeeCount: null },
      {
        companySizeContext:
          "The campus has approximately 420–610 enrolled students this term.",
      },
    );
    expect(resolution.value).toBeNull();
    expect(resolution.provenance?.hedged).toBe(true);

    const evaluated = evaluateIcpCriterionWithEvidenceClass({
      criterion: enrolledStudents,
      actualValue: resolution.value,
      provenance: resolution.provenance,
    });
    expect(evaluated.evidenceOutcome).toBe("UNVERIFIABLE");
    expect(evaluated.excludeFromScore).toBe(true);
  });

  it("prefers the numeric list field when both list and research have a value", () => {
    const resolution = resolveCompanyActualWithProvenance(
      enrolledStudents,
      { employeeCount: 310 },
      { companySizeContext: schoolSizeProse },
    );
    expect(resolution.value).toBe(310);
    expect(resolution.provenance).toMatchObject({
      source: "LIST",
      field: "employeeCount",
      label: "Enrolled students: 310 (from your list)",
      excerpt: null,
    });
  });

  it("does not invent a factual result when list and research are blank", () => {
    const evidence = evaluateIcpCriterionWithEvidenceClass({
      criterion: enrolledStudents,
      actualValue: null,
    });
    const clamped = clampFactualAiDimension({
      dimensionName: "Enrolled students",
      aiAssessment: "STRONG",
      evidenceAssessment: evidence,
    });
    expect(evidence.factualAiForbidden).toBe(true);
    expect(clamped.forced).toBe(true);
    expect(clamped.assessment).toBe("UNKNOWN");
  });

  it("resolves an ENUM criterion from research using the target value, not the name", () => {
    const board = criterion({
      name: "Accrediting body",
      criterionType: "oversight",
      dataType: "ENUM",
      operator: "IN",
      targetValue: ["NEASC"],
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      board,
      { industry: null },
      {
        businessModel:
          "Day academy accredited by NEASC with a boarding option.",
      },
    );
    expect(resolution.provenance).toMatchObject({
      source: "RESEARCH",
      field: "businessModel",
      label: expect.stringContaining("(from research)"),
    });
    const evaluated = evaluateCriterionDeterministic({
      criterion: board,
      actualValue: resolution.value,
    });
    expect(evaluated.assessment).toBe("STRONG");
  });

  it("leaves overlapping numeric ranges unresolved instead of picking a midpoint", () => {
    const tight = criterion({
      name: "Enrolled students",
      criterionType: "enrollment_band",
      dataType: "NUMBER",
      operator: "BETWEEN",
      minValue: 200,
      maxValue: 450,
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      tight,
      { employeeCount: null },
      { companySizeContext: schoolSizeProse },
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
      [enrolledStudents],
      { employeeCount: null },
      {
        companySizeContext: schoolSizeProse,
        companySummary: null,
        whatTheySell: null,
        businessModel: null,
        relevantTechnologies: [],
        buyingSignals: [],
        riskSignals: [],
        primaryMarkets: [],
      } as unknown as Parameters<typeof identifyIcpEvidenceGaps>[2],
    );
    expect(gaps).toEqual([]);
  });

  it("prefers a list text field when it matches the criterion target", () => {
    const board = criterion({
      name: "Accrediting body",
      criterionType: "oversight",
      dataType: "ENUM",
      operator: "IN",
      targetValue: ["NEASC"],
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      board,
      { industry: "NEASC day academy" },
      {
        businessModel: "Some other sentence that also mentions NEASC.",
      },
    );
    expect(resolution.provenance).toMatchObject({
      source: "LIST",
      field: "industry",
      label: expect.stringContaining("from your list"),
    });
  });

  it("does not treat an unrelated list industry as the actual for a TEXT criterion", () => {
    const board = criterion({
      name: "Accrediting body",
      criterionType: "oversight",
      dataType: "ENUM",
      operator: "IN",
      targetValue: ["NEASC"],
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      board,
      { industry: "independent school", location: "Concord" },
      {
        businessModel:
          "Day academy accredited by NEASC with a boarding option.",
      },
    );
    expect(resolution.provenance).toMatchObject({
      source: "RESEARCH",
      field: "businessModel",
    });
  });

  it("does not treat school copy as a currency figure", () => {
    const resolution = resolveCompanyActualWithProvenance(
      rateBase,
      { revenue: null },
      {
        whatTheySell: "Day academy with boarding, arts, and athletics.",
        businessModel: "Tuition-funded independent school.",
      },
    );
    expect(resolution.value).toBeNull();
    expect(resolution.provenance).toBeNull();
  });
});

describe("research cascade actuals — municipal utilities", () => {
  it("extracts a CURRENCY figure from research using $ / scale, not criterion name", () => {
    const resolution = resolveCompanyActualWithProvenance(
      rateBase,
      { revenue: null },
      {
        companySummary:
          "The commission reported a $25 million rate base last year.",
      },
    );
    expect(isNumericEvidence(resolution.value)).toBe(true);
    expect(resolution.provenance?.source).toBe("RESEARCH");
    expect(resolution.provenance?.hedged).toBe(false);
    expect(resolution.provenance?.label).toContain("Rate base");
    const evaluated = evaluateCriterionDeterministic({
      criterion: rateBase,
      actualValue: resolution.value,
    });
    expect(evaluated.assessment).toMatch(/STRONG|MODERATE/);
  });

  it("resolves an ENUM service class from target needles in research prose", () => {
    const serviceClass = criterion({
      name: "Service class",
      criterionType: "tariff_class",
      dataType: "ENUM",
      operator: "IN",
      targetValue: ["irrigation"],
      evidenceClass: "LIST_DATA",
    });
    const resolution = resolveCompanyActualWithProvenance(
      serviceClass,
      { industry: null, location: null },
      {
        primaryMarkets: ["irrigation allotments along the canal district"],
      },
    );
    expect(resolution.provenance?.source).toBe("RESEARCH");
    const evaluated = evaluateCriterionDeterministic({
      criterion: serviceClass,
      actualValue: resolution.value,
    });
    expect(evaluated.assessment).toBe("STRONG");
  });

  it("does not parse a currency amount as a NUMBER criterion", () => {
    const resolution = resolveCompanyActualWithProvenance(
      enrolledStudents,
      { employeeCount: null },
      {
        companySummary:
          "The commission reported a $25 million rate base last year.",
      },
    );
    expect(resolution.value).toBeNull();
  });

  it("surfaces provenance labels from stored assessment data", () => {
    expect(
      readCriterionProvenanceLabels({
        criterionAssessments: [
          {
            provenance: { label: "Enrolled students: 420–610 (from research)" },
          },
        ],
      }),
    ).toEqual(["Enrolled students: 420–610 (from research)"]);
  });
});
