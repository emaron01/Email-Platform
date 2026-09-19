import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("first introducer / net-new company research", () => {
  it("adds firstResearchedByUserId to schema and migration", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("firstResearchedByUserId");
    expect(schema).toContain("ResearchFirstIntroducedBy");

    const migration = readFileSync(
      "prisma/migrations/20260915170000_company_research_first_introducer/migration.sql",
      "utf8",
    );
    expect(migration).toContain("firstResearchedByUserId");
  });

  it("quota and save paths use first introducer, not researchedByUserId filter", () => {
    const quota = readFileSync("src/lib/usage/quota-service.ts", "utf8");
    expect(quota).toContain("firstResearchedByUserId");
    expect(quota).not.toMatch(
      /countActiveResearchedCompanies\([\s\S]*researchedByUserId:/,
    );

    const active = readFileSync(
      "src/lib/usage/active-companies-service.ts",
      "utf8",
    );
    expect(active).toContain("firstResearchedByUserId");
    expect(active).toContain("includeInProgressClaims");

    const research = readFileSync(
      "src/lib/tenant/company-research-service.ts",
      "utf8",
    );
    expect(research).toContain("company-research-intro:");
    expect(research).toContain("firstResearchedByUserId");
    expect(research).toContain("pg_advisory_xact_lock");
    expect(research).toContain("planUsesPerUserCompanyAllowance");
    expect(research).toContain("userId: perUser ? user.id : null");
  });
});
