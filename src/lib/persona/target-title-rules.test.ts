import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parsePersonaAiResponse } from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import { parsePersonaFormData } from "@/lib/persona/save";
import {
  parseTargetTitleField,
  targetTitleProblem,
} from "@/lib/persona/target-title-rules";
import { TenantError } from "@/lib/tenant/errors";

const LONG_TITLE =
  "Senior Vice President, Business Development and Sales";

function draft(likelyTitles: string[]) {
  return {
    personaDraft: {
      name: "VP of Sales",
      likelyTitles,
      departmentFunction: "Sales",
      roleSummary: "Owns the sales forecast.",
      negativeRoleSignals: [
        {
          text: "Individual-contributor seller",
          exclusionTestability: "TITLE_TESTABLE",
        },
      ],
      confidence: "HIGH",
    },
  };
}

describe("target title rules", () => {
  it("rejects synthesis output that is only a seniority token", () => {
    expect(() => parsePersonaAiResponse(draft(["VP"]))).toThrow(ZodError);
    expect(targetTitleProblem("Director")).toMatch(/seniority level/);
    expect(targetTitleProblem("Head")).toMatch(/seniority level/);
    expect(targetTitleProblem("Senior Vice President")).toMatch(/seniority level/);
    expect(targetTitleProblem("Vice President of Sales")).toBeNull();
  });

  it("stores a title longer than the imported 50-character cut, including its comma", () => {
    expect(LONG_TITLE.length).toBeGreaterThan(50);
    expect(parseTargetTitleField(LONG_TITLE)).toEqual([LONG_TITLE]);
    expect(parseTargetTitleField(JSON.stringify([LONG_TITLE]))).toEqual([
      LONG_TITLE,
    ]);

    const fd = new FormData();
    fd.set("id", "");
    fd.set("productId", "prod_1");
    fd.set("name", "VP of Sales");
    fd.set("targetTitles", LONG_TITLE);
    expect(parsePersonaFormData(fd).fields.targetTitles).toEqual([LONG_TITLE]);
  });

  it("accepts a normal persona title list", () => {
    const titles = [
      "Vice President of Sales",
      "Chief Revenue Officer",
      "Head of Sales Enablement",
    ];
    const parsed = parsePersonaAiResponse(draft(titles));
    expect(parsed.data.personaDraft.likelyTitles).toEqual(titles);
    expect(titles.map(targetTitleProblem)).toEqual([null, null, null]);
  });

  it("rejects a title cut off mid-word when the persona form is saved", () => {
    const fd = new FormData();
    fd.set("productId", "prod_1");
    fd.set("name", "VP of Sales");
    fd.set("targetTitles", "Business Development and Sa");
    expect(() => parsePersonaFormData(fd)).toThrow(TenantError);
  });

  it("tells synthesis to emit formal titles that name a function", () => {
    const messages = buildPersonaSynthesisMessages({
      productName: "Example",
      productSnapshot: { name: "Example" },
      productMessaging: null,
      buyerRole: {
        name: "VP of Sales",
        likelyTitles: ["Vice President of Sales"],
        departmentFunction: "Sales",
        whyThisRoleMatters: "Owns the forecast",
        suggestionKey: "vp-sales",
        confidence: "HIGH",
        evidenceRefs: [],
      },
      userContext: null,
      productEvidence: [],
      icpContext: null,
    });
    expect(messages[0]!.content).toContain("Vice President of Sales");
    expect(messages[0]!.content).toContain("Chief Revenue Officer");
    expect(messages[0]!.content).toContain("do not cut a title off mid-word");
  });
});
