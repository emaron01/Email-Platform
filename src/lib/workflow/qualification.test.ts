import { describe, expect, it } from "vitest";
import {
  deterministicContactQualification,
  scoreLabelToBucket,
} from "@/lib/workflow/qualification";
import type { IcpQualification } from "@/lib/scoring/icp-qualification";

const goodIcp: IcpQualification = {
  bucket: "GOOD",
  secondaryFlags: [],
  primaryPassed: ["Industry"],
  primaryUnresolved: [],
  primaryFailed: [],
  primaryFailedLines: [],
  mandatoryFailures: [],
};

describe("deterministicContactQualification", () => {
  it("returns EXCLUDED for mandatory ICP failure", () => {
    const result = deterministicContactQualification({
      icpQualification: {
        ...goodIcp,
        bucket: "NO",
        mandatoryFailures: ["Employee Count"],
      },
      criteria: [],
      criterionAssessments: [],
      candidatePersonas: [{ id: "persona_1", name: "CRO" }],
      excludedPersonaIds: [],
      titleExcludedPersonaIds: [],
      hadTitleCandidate: true,
      anyUnknownTitle: false,
    });
    expect(result.bucket).toBe("EXCLUDED");
    expect(result.aiSkipReason).toBe("MANDATORY_ICP_FAIL");
  });

  it("returns EXCLUDED for title-gate persona exclusion", () => {
    const result = deterministicContactQualification({
      icpQualification: goodIcp,
      criteria: [],
      criterionAssessments: [],
      candidatePersonas: [],
      excludedPersonaIds: [],
      titleExcludedPersonaIds: ["persona_1"],
      hadTitleCandidate: false,
      anyUnknownTitle: false,
    });
    expect(result.bucket).toBe("EXCLUDED");
    expect(result.aiSkipReason).toBe("CONFIRMED_PERSONA_EXCLUSION");
  });

  it("returns GOOD for a clean single persona match", () => {
    const result = deterministicContactQualification({
      icpQualification: goodIcp,
      criteria: [],
      criterionAssessments: [],
      candidatePersonas: [{ id: "persona_1", name: "CRO" }],
      excludedPersonaIds: [],
      titleExcludedPersonaIds: [],
      hadTitleCandidate: true,
      anyUnknownTitle: false,
    });
    expect(result).toMatchObject({
      bucket: "GOOD",
      matchedPersonaId: "persona_1",
      aiSkipReason: "SINGLE_PERSONA_MATCH",
    });
  });

  it("returns NEEDS_REVIEW for multiple persona matches", () => {
    const result = deterministicContactQualification({
      icpQualification: goodIcp,
      criteria: [],
      criterionAssessments: [],
      candidatePersonas: [
        { id: "persona_1", name: "CRO" },
        { id: "persona_2", name: "VP Sales" },
      ],
      excludedPersonaIds: [],
      titleExcludedPersonaIds: [],
      hadTitleCandidate: true,
      anyUnknownTitle: false,
    });
    expect(result.bucket).toBe("NEEDS_REVIEW");
    expect(result.aiSkipReason).toBe("MULTI_PERSONA_MATCH");
    expect(result.matchedPersonaId).toBeNull();
  });

  it("prefers explicit qualificationBucket on new score rows", () => {
    expect(
      scoreLabelToBucket("GOOD", {
        qualificationBucket: "NEEDS_REVIEW",
        qualificationReason: "Manual review",
      }),
    ).toBe("NEEDS_REVIEW");
  });
});
