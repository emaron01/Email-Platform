/**
 * Claim-conflict helpers — informational flags only; never block send.
 */
import { describe, expect, it } from "vitest";
import {
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

  it("parses claimConflictsJson arrays", () => {
    const conflicts = [
      {
        type: "PROHIBITED_TERM" as const,
        description: "Generated copy uses prohibited terminology: ROI guarantee",
        matchedGuard: "ROI guarantee",
        bodyExcerpt: "ROI guarantee",
      },
    ];
    expect(claimConflictsFromJson(conflicts)).toHaveLength(1);
    expect(claimConflictsFromJson([])).toHaveLength(0);
    expect(claimConflictsFromJson(null)).toHaveLength(0);
  });
});
