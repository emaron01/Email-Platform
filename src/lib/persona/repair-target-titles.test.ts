import { describe, expect, it } from "vitest";
import {
  planPersonaTitleRepair,
} from "@/lib/persona/repair-target-titles";
import { targetTitleProblem } from "@/lib/persona/target-title-rules";
import { contactMatchesPersonaTitles } from "@/lib/scoring/title-fit";

const CRO_BEFORE = [
  "Chief Revenue Officer",
  "Chief Sales Officer",
  "VP of Revenue",
  "Founder",
  "President of Sales",
  "VP",
  "GTM Strategy & Operations + Interim Head of Sa",
  "Advisor - Chief Revenue Officer (CRO)",
];

const CRO_DRAFT = {
  likelyTitles: [
    "Chief Revenue Officer",
    "Chief Sales Officer",
    "VP of Revenue",
    "President of Sales",
    "Founder",
    "GTM Strategy & Operations + Interim Head of Sales",
  ],
};

const VP_BEFORE = [
  "VP Sales",
  "Senior Vice President of Sales",
  "Head of Sales",
  "Regional VP Sales",
  "Senior Vice President",
  "Business Development and Sa",
  "VP",
  "Mid-Market Sales & Revenue Operations",
  "V.P. of Sales",
];

const VP_DRAFT = {
  likelyTitles: [
    "VP Sales",
    "Senior Vice President of Sales",
    "Head of Sales",
    "Regional VP Sales",
    "Senior Vice President, Business Development and Sales",
    "VP, Mid-Market Sales & Revenue Operations",
    "V.P. of Sales",
  ],
};

const CRO_APPROVED = [
  "President of Sales",
  "VP, GTM Strategy & Operations + Interim Head of Sa",
  "Advisor - Chief Revenue Officer (CRO)",
];

const VP_APPROVED = [
  "Vice President of Sales",
  "Senior Vice President, Business Development and Sa",
  "VP, Mid-Market Sales & Revenue Operations",
  "V.P. of Sales",
  "VP of Sales",
];

describe("Erik persona target-title repair", () => {
  const cro = planPersonaTitleRepair({
    personaId: "cro",
    personaName: "Chief Revenue Officer",
    currentTitles: CRO_BEFORE,
    draft: CRO_DRAFT,
    approvedSuggestionTitles: CRO_APPROVED,
  });
  const vp = planPersonaTitleRepair({
    personaId: "vp",
    personaName: "Vice president of Sales",
    currentTitles: VP_BEFORE,
    draft: VP_DRAFT,
    approvedSuggestionTitles: VP_APPROVED,
  });

  it("drops the bare VP and the cut-off fragments", () => {
    for (const plan of [cro, vp]) {
      expect(plan.after.some((title) => targetTitleProblem(title))).toBe(false);
      expect(plan.after).not.toContain("VP");
      expect(plan.after.join(" ")).not.toMatch(/\bSa\b/);
      expect(plan.after).not.toContain("Senior Vice President");
      expect(plan.after).not.toContain("Business Development and Sa");
    }
    expect(cro.after).toContain(
      "GTM Strategy & Operations + Interim Head of Sales",
    );
    expect(cro.after).toContain("Advisor - Chief Revenue Officer (CRO)");
    expect(cro.keptApprovedAdditions).toEqual([
      "Advisor - Chief Revenue Officer (CRO)",
    ]);
    expect(vp.after).toContain(
      "Senior Vice President, Business Development and Sales",
    );
    expect(vp.after).toContain("VP, Mid-Market Sales & Revenue Operations");
    expect(vp.after).toContain("Vice President of Sales");
    expect(vp.after).toContain("VP of Sales");
    expect(vp.keptApprovedAdditions).toEqual([
      "Vice President of Sales",
      "VP of Sales",
    ]);
  });

  it("scores ordinary sales and CRO titles against the repaired lists", () => {
    const matched = (title: string) =>
      [
        { name: cro.personaName, titles: cro.after },
        { name: "VP of Sales", titles: vp.after },
      ]
        .filter((persona) =>
          contactMatchesPersonaTitles(title, persona.titles).matched,
        )
        .map((persona) => persona.name);

    expect(matched("Vice President of Sales")).toEqual(["VP of Sales"]);
    expect(matched("SVP Worldwide Sales")).toEqual(["VP of Sales"]);
    expect(matched("Chief Revenue Officer")).toEqual(["Chief Revenue Officer"]);
    expect(matched("VP")).toEqual([]);
  });

  it("refuses a draft title that is only a seniority level", () => {
    expect(() =>
      planPersonaTitleRepair({
        personaId: "cro",
        personaName: "Chief Revenue Officer",
        currentTitles: ["VP"],
        draft: { likelyTitles: ["VP", "Director"] },
        approvedSuggestionTitles: [],
      }),
    ).toThrow(/cannot be stored/);
  });
});
