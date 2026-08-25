import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assignMigratedIcpCriterionTier,
  coerceIsMandatory,
  logIcpCriterionTierAssignments,
  migrateExistingIcpCriterionTier,
  proposeIcpCriterionTier,
  resolveProposedIcpCriterionTier,
} from "@/lib/criteria/tier";
import { ICP_INTERPRETATION_PROMPT_VERSION } from "@/lib/criteria/types";

describe("ICP criterion tier proposal", () => {
  it("proposes PRIMARY for firmographics that define the customer", () => {
    expect(
      proposeIcpCriterionTier({
        name: "Industry",
        criterionType: "industry",
        evidenceClass: "LIST_DATA",
      }),
    ).toBe("PRIMARY");
    expect(
      proposeIcpCriterionTier({
        name: "Employee Count",
        criterionType: "employee_count",
        evidenceClass: "LIST_DATA",
      }),
    ).toBe("PRIMARY");
    expect(
      proposeIcpCriterionTier({
        name: "Company Revenue",
        criterionType: "company_revenue",
        evidenceClass: "LIST_DATA",
      }),
    ).toBe("PRIMARY");
    expect(
      proposeIcpCriterionTier({
        name: "Business Model",
        criterionType: "business_model",
        evidenceClass: "COMPANY_RESEARCH",
      }),
    ).toBe("PRIMARY");
  });

  it("proposes SECONDARY for tooling, tech stack, timing, and in-flight initiatives", () => {
    expect(
      proposeIcpCriterionTier({
        name: "Required Technologies",
        criterionType: "technology",
        description: "Uses Salesforce or HubSpot",
        evidenceClass: "TARGETED_SEARCH",
      }),
    ).toBe("SECONDARY");
    expect(
      proposeIcpCriterionTier({
        name: "Replacing VMware",
        criterionType: "initiative",
        evidenceClass: "TARGETED_SEARCH",
      }),
    ).toBe("SECONDARY");
    expect(
      proposeIcpCriterionTier({
        name: "Buying signal",
        criterionType: "positive_signal",
        evidenceClass: "COMPANY_RESEARCH",
      }),
    ).toBe("SECONDARY");
  });

  it("never proposes mandatory", () => {
    expect(coerceIsMandatory("PRIMARY", undefined)).toBe(false);
    expect(coerceIsMandatory("PRIMARY", true)).toBe(true);
    expect(coerceIsMandatory("SECONDARY", true)).toBe(false);
  });

  it("uses the AI proposal when valid and infers when omitted", () => {
    expect(
      resolveProposedIcpCriterionTier({
        proposedTier: "SECONDARY",
        name: "Industry",
        criterionType: "industry",
      }),
    ).toBe("SECONDARY");
    expect(
      resolveProposedIcpCriterionTier({
        proposedTier: "not-a-tier",
        name: "Industry",
        criterionType: "industry",
        evidenceClass: "LIST_DATA",
      }),
    ).toBe("PRIMARY");
  });
});

describe("existing criterion tier migration", () => {
  it("maps TARGETED_SEARCH to SECONDARY and everything else to PRIMARY, never mandatory", () => {
    expect(migrateExistingIcpCriterionTier("TARGETED_SEARCH")).toBe(
      "SECONDARY",
    );
    expect(migrateExistingIcpCriterionTier("LIST_DATA")).toBe("PRIMARY");
    expect(migrateExistingIcpCriterionTier("COMPANY_RESEARCH")).toBe("PRIMARY");
    expect(migrateExistingIcpCriterionTier("SEMANTIC")).toBe("PRIMARY");
  });

  it("logs every Primary Target assignment", () => {
    const existing = [
      {
        id: "industry",
        name: "Industry",
        criterionType: "industry",
        evidenceClass: "LIST_DATA",
      },
      {
        id: "employees",
        name: "Employee Count",
        criterionType: "employee_count",
        evidenceClass: "LIST_DATA",
      },
      {
        id: "revenue",
        name: "Company Revenue",
        criterionType: "company_revenue",
        evidenceClass: "LIST_DATA",
      },
      {
        id: "tech",
        name: "Required Technologies",
        criterionType: "technology",
        evidenceClass: "TARGETED_SEARCH",
      },
    ];
    const assignments = existing.map(assignMigratedIcpCriterionTier);
    expect(
      assignments.map((a) => `${a.name}:${a.tier}:${a.isMandatory}`),
    ).toEqual([
      "Industry:PRIMARY:false",
      "Employee Count:PRIMARY:false",
      "Company Revenue:PRIMARY:false",
      "Required Technologies:SECONDARY:false",
    ]);
    const lines: string[] = [];
    logIcpCriterionTierAssignments(assignments, (line) => lines.push(line));
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("Required Technologies");
    expect(lines[3]).toContain("tier=SECONDARY");
    expect(lines.every((line) => line.includes("isMandatory=false"))).toBe(
      true,
    );
  });
});

describe("interpretation prompt includes tier proposal rules", () => {
  it("bumps ICP interpretation prompt version with tier rules", () => {
    expect(ICP_INTERPRETATION_PROMPT_VERSION).toBe("4");
    const icp = readFileSync("src/lib/interpretation/icp.ts", "utf8");
    expect(icp).toContain("Assign tier using these definitions");
    expect(icp).toContain("NEVER set a criterion as mandatory");
    expect(icp).toContain("Currently replacing VMware");
    const types = readFileSync("src/lib/criteria/types.ts", "utf8");
    expect(types).toContain('ICP_INTERPRETATION_PROMPT_VERSION = "4"');
    const migration = readFileSync(
      "prisma/migrations/20260825120000_icp_criterion_tier_mandatory/migration.sql",
      "utf8",
    );
    expect(migration).toContain("icp_criterion_tier_backfill");
    expect(migration).toContain("TARGETED_SEARCH");
  });
});
