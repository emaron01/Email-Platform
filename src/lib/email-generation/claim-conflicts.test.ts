/**
 * Claim-conflict helpers and keep-draft behavior.
 */
import { describe, expect, it } from "vitest";
import {
  claimConflictsBlockSend,
  claimConflictsFromJson,
  claimViolationsToIssues,
} from "@/lib/email-generation/claim-conflicts";

describe("claim conflict helpers", () => {
  it("maps claim-guard violations into issues with excerpt and matched guard", () => {
    const issues = claimViolationsToIssues([
      {
        type: "PROHIBITED_CLAIM",
        description:
          "Generated copy repeats a prohibited claim: Guaranteed revenue growth",
        matchedGuard: "Guaranteed revenue growth",
        bodyExcerpt: "Guaranteed revenue growth this quarter",
      },
    ]);
    expect(issues[0]).toMatchObject({
      path: "body:Guaranteed revenue growth this quarter",
      code: "PROHIBITED_CLAIM",
      expected:
        "Generated copy repeats a prohibited claim: Guaranteed revenue growth",
      matchedGuard: "Guaranteed revenue growth",
      bodyExcerpt: "Guaranteed revenue growth this quarter",
    });
  });

  it("blocks send until conflicts are acknowledged", () => {
    const conflicts = [
      {
        type: "PROHIBITED_TERM" as const,
        description: "Generated copy uses prohibited terminology: ROI guarantee",
        matchedGuard: "ROI guarantee",
        bodyExcerpt: "ROI guarantee",
      },
    ];
    expect(
      claimConflictsBlockSend({
        claimConflictsJson: conflicts,
        claimConflictsAcknowledgedAt: null,
      }),
    ).toBe(true);
    expect(
      claimConflictsBlockSend({
        claimConflictsJson: conflicts,
        claimConflictsAcknowledgedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      claimConflictsBlockSend({
        claimConflictsJson: [],
        claimConflictsAcknowledgedAt: null,
      }),
    ).toBe(false);
    expect(claimConflictsFromJson(conflicts)).toHaveLength(1);
  });
});
