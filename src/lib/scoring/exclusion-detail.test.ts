import { describe, expect, it } from "vitest";
import {
  buildExclusionDetails,
  deriveExclusionDetails,
  formatComparisonPhrase,
  formatExclusionDetailLine,
  groupExclusionDetailsByCriterion,
  readExclusionDetails,
} from "@/lib/scoring/exclusion-detail";
import type { CriterionEvidenceAssessment } from "@/lib/criteria/targeted-search-eval";
import type { PersonaExclusionAssessment } from "@/lib/scoring/persona-exclusions";

describe("exclusion-detail", () => {
  it("builds ICP exclusion detail with range, value, source, and comparison", () => {
    const assessment: CriterionEvidenceAssessment = {
      scope: "ICP",
      name: "Company Revenue",
      criterionId: "crit_rev",
      evidenceClass: "LIST_DATA",
      assessment: "NO_FIT",
      confidence: "HIGH",
      method: "DETERMINISTIC",
      reasoning: "Revenue below threshold.",
      evidenceOutcome: "CONTRADICTED",
      excludeFromScore: false,
      factualAiForbidden: false,
      confirmedFailureLine: "Company Revenue: $8M (outside $50M–$100M)",
      provenance: {
        source: "LIST",
        field: "revenue",
        excerpt: null,
        displayValue: "$8M",
        label: "List data: revenue",
        hedged: false,
      },
    };
    const details = buildExclusionDetails({
      criterionAssessments: [assessment],
      icpCriteria: [
        {
          id: "crit_rev",
          name: "Company Revenue",
          criterionType: "ICP",
          dataType: "CURRENCY",
          operator: "BETWEEN",
          minValue: "$50M",
          maxValue: "$100M",
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
    });
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      kind: "ICP",
      criterionRange: "Company Revenue between $50M and $100M",
      resolvedValue: "$8M",
      sourceKind: "LIST",
      comparison: "below the minimum",
    });
    expect(formatExclusionDetailLine(details[0]!)).toContain("$8M");
    expect(formatExclusionDetailLine(details[0]!)).toContain("below the minimum");
  });

  it("builds persona exclusion detail with matched text", () => {
    const persona: PersonaExclusionAssessment = {
      scope: "PERSONA",
      criterionId: "ex_1",
      criterion: "Individual seller",
      testability: "TITLE_TESTABLE",
      outcome: "CONFIRMED",
      evidence: ["Contact title: Account Executive"],
      confidence: "HIGH",
      reasoning: "Contact title confirms persona exclusion.",
      excludeFromScore: true,
    };
    const details = buildExclusionDetails({
      criterionAssessments: [],
      personaExclusionAssessments: [persona],
    });
    expect(details[0]).toMatchObject({
      kind: "PERSONA",
      criterionName: "Individual seller",
      matchedText: "Contact title: Account Executive",
    });
  });

  it("derives exclusion details from assessmentData when exclusionDetails is absent", () => {
    const assessmentData = {
      criterionAssessments: [
        {
          scope: "ICP",
          name: "Industry",
          assessment: "NO_FIT",
          evidenceOutcome: "CONTRADICTED",
          excludeFromScore: false,
          provenance: {
            source: "RESEARCH",
            field: "industry",
            excerpt: "The company operates in retail.",
            displayValue: "Retail",
            label: "Research: industry",
            hedged: false,
          },
        },
      ],
    };
    expect(deriveExclusionDetails(assessmentData)).toHaveLength(1);
    expect(readExclusionDetails(assessmentData)[0]?.kind).toBe("ICP");
  });

  it("groups contacts excluded on the same criterion", () => {
    const detail = {
      kind: "ICP" as const,
      criterionId: "crit_rev",
      criterionName: "Company Revenue",
      criterionRange: "Company Revenue between $50M and $100M",
      resolvedValue: "$8M",
      sourceKind: "LIST" as const,
      sourceLabel: "List data",
      comparison: "below the minimum",
    };
    const groups = groupExclusionDetailsByCriterion([
      { contactId: "c1", details: [detail] },
      { contactId: "c2", details: [detail] },
      { contactId: "c3", details: [{ ...detail, criterionId: "other" }] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.contactIds).toEqual(["c1", "c2"]);
  });

  it("formats numeric comparison phrases", () => {
    expect(
      formatComparisonPhrase(
        { operator: "BETWEEN", minValue: 50, maxValue: 100 },
        "$8",
      ),
    ).toBe("below the minimum");
    expect(
      formatComparisonPhrase(
        { operator: "GREATER_THAN", targetValue: 100 },
        "50",
      ),
    ).toBe("below the minimum");
  });
});
