import { describe, expect, it } from "vitest";
import type { CriterionSnapshot } from "@/lib/criteria/types";
import {
  canonicalTitle,
  contactMatchesPersonaTitles,
  evaluatePersonaTitleGate,
  titlesMatch,
} from "@/lib/scoring/title-fit";

function exclusion(name: string): CriterionSnapshot {
  return {
    id: "ex_1",
    name,
    description: name,
    criterionType: "negative_role_signal",
    dataType: "TEXT",
    operator: "EXISTS",
    importance: "CRITICAL",
    isRequired: false,
    isDisqualifier: true,
    exclusionTestability: "TITLE_TESTABLE",
    sortOrder: 0,
  };
}

describe("title canonicalization", () => {
  it("folds VP / Vice President / VP of variants to the same tokens", () => {
    expect(canonicalTitle("VP Sales")).toBe("vp sales");
    expect(canonicalTitle("VP of Sales")).toBe("vp sales");
    expect(canonicalTitle("Vice President of Sales")).toBe("vp sales");
    expect(canonicalTitle("SVP of Sales")).toBe("vp sales");
  });

  it("folds CRO and Chief Revenue Officer together", () => {
    expect(canonicalTitle("CRO")).toBe("cro");
    expect(canonicalTitle("Chief Revenue Officer")).toBe("cro");
  });
});

describe("titlesMatch", () => {
  it("matches equivalent VP Sales phrasings", () => {
    expect(titlesMatch("VP Sales", "Vice President of Sales")).toBe(true);
    expect(titlesMatch("Vice President of Sales", "VP of Sales")).toBe(true);
  });

  it("does not match a Founder to VP Sales", () => {
    expect(titlesMatch("Founder", "VP of Sales")).toBe(false);
    expect(titlesMatch("Account Executive", "Chief Revenue Officer")).toBe(
      false,
    );
  });

  it("does not treat seniority-only overlap as a match", () => {
    expect(titlesMatch("VP Marketing", "VP Sales")).toBe(false);
  });
});

describe("contactMatchesPersonaTitles", () => {
  it("reads the persona's own likelyTitles rather than a hardcoded list", () => {
    const likely = ["VP Revenue Operations", "Head of RevOps"];
    expect(
      contactMatchesPersonaTitles("VP of Revenue Operations", likely).matched,
    ).toBe(true);
    expect(
      contactMatchesPersonaTitles("Head of Revenue Operations", likely).matched,
    ).toBe(true);
    expect(contactMatchesPersonaTitles("Founder", likely).matched).toBe(false);
    expect(contactMatchesPersonaTitles("CRO", likely).matched).toBe(false);
  });

  it("matches a likely-title acronym at the start of a longer title", () => {
    expect(
      contactMatchesPersonaTitles("CRO, SoftWriters", [
        "CRO",
        "Chief Revenue Officer",
      ]).matched,
    ).toBe(true);
    expect(
      contactMatchesPersonaTitles("Chief Risk Officer (CRO)", [
        "CRO",
        "Chief Revenue Officer",
      ]).matched,
    ).toBe(false);
  });

  it("returns unmatched when the persona has no likelyTitles", () => {
    expect(contactMatchesPersonaTitles("VP Sales", []).matched).toBe(false);
    expect(contactMatchesPersonaTitles("VP Sales", null).matched).toBe(false);
  });
});

describe("evaluatePersonaTitleGate", () => {
  const persona = {
    id: "persona_vp",
    name: "VP of Sales",
    targetTitles: ["VP of Sales", "Vice President of Sales"],
    criteria: [] as CriterionSnapshot[],
  };

  it("marks a title match as a candidate when the positive gate is on", () => {
    const result = evaluatePersonaTitleGate({
      persona,
      contactTitle: "VP Sales",
      applyPositiveFit: true,
    });
    expect(result.status).toBe("CANDIDATE");
  });

  it("marks an unrecognized title as UNKNOWN, not excluded", () => {
    const result = evaluatePersonaTitleGate({
      persona,
      contactTitle: "Founder",
      applyPositiveFit: true,
    });
    expect(result.status).toBe("UNKNOWN");
  });

  it("excludes a confirmed TITLE_TESTABLE hit before the positive gate", () => {
    const result = evaluatePersonaTitleGate({
      persona: {
        ...persona,
        criteria: [exclusion("Sales representative or account executive")],
      },
      contactTitle: "Account Executive",
      applyPositiveFit: true,
    });
    expect(result.status).toBe("EXCLUDED");
  });

  it("skips the positive gate on a single-persona run", () => {
    const result = evaluatePersonaTitleGate({
      persona,
      contactTitle: "Founder",
      applyPositiveFit: false,
    });
    expect(result.status).toBe("CANDIDATE");
  });
});
