import { afterEach, describe, expect, it } from "vitest";
import { clearAiProviderCache } from "@/lib/ai/provider";
import {
  getCompanyResearchProvider,
  setCompanyResearchProvider,
  UnconfiguredCompanyResearchProvider,
} from "@/lib/research/provider";
import { updateManualCompanyResearch } from "@/lib/tenant/companies";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  clearAiProviderCache();
  setCompanyResearchProvider(null);
});

describe("research vs scoring independence (behavior)", () => {
  it("missing Research AI config still exposes unconfigured automated provider", () => {
    delete process.env.RESEARCH_AI_PROVIDER;
    delete process.env.RESEARCH_AI_MODEL;
    delete process.env.RESEARCH_AI_MODEL_URL;
    delete process.env.RESEARCH_AI_API_KEY;
    process.env.SCORING_AI_PROVIDER = "openai-compatible";
    process.env.SCORING_AI_MODEL = "scoring-model";
    process.env.SCORING_AI_MODEL_URL = "https://scoring.example/v1/chat/completions";
    process.env.SCORING_AI_API_KEY = "scoring-key";

    const provider = getCompanyResearchProvider();
    expect(provider).toBeInstanceOf(UnconfiguredCompanyResearchProvider);
  });

  it("missing Scoring AI does not change research provider selection when research configured", () => {
    delete process.env.SCORING_AI_PROVIDER;
    delete process.env.SCORING_AI_MODEL;
    delete process.env.SCORING_AI_MODEL_URL;
    delete process.env.SCORING_AI_API_KEY;
    process.env.RESEARCH_AI_PROVIDER = "openai-compatible";
    process.env.RESEARCH_AI_MODEL = "research-model";
    process.env.RESEARCH_AI_MODEL_URL =
      "https://research.example/v1/chat/completions";
    process.env.RESEARCH_AI_API_KEY = "research-key";

    const provider = getCompanyResearchProvider();
    expect(provider).not.toBeInstanceOf(UnconfiguredCompanyResearchProvider);
  });
});

describe.skipIf(!process.env.DATABASE_URL?.trim())(
  "manual research without Research AI",
  { timeout: 60_000 },
  () => {
    it("manual research update remains usable without Research AI config", async () => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();

      try {
        await prisma.$queryRaw`SELECT "aiProvider" FROM "CompanyResearch" LIMIT 0`;
      } catch {
        await prisma.$disconnect();
        console.warn(
          "Skipping manual research independence DB test: apply research provenance migration first.",
        );
        return;
      }

      delete process.env.RESEARCH_AI_PROVIDER;
      delete process.env.RESEARCH_AI_MODEL;
      delete process.env.RESEARCH_AI_MODEL_URL;
      delete process.env.RESEARCH_AI_API_KEY;

      const suffix = Date.now().toString(36);
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Manual Research ${suffix}`,
          slug: `test-manual-research-${suffix}`,
          status: "ACTIVE",
        },
      });
      process.env.DEV_ORGANIZATION_ID = org.id;

      const company = await prisma.company.create({
        data: {
          organizationId: org.id,
          name: "Manual Co",
          normalizedName: "manual co",
          normalizedDomain: `manual-${suffix}.com`,
          website: `https://manual-${suffix}.com`,
        },
      });

      const saved = await updateManualCompanyResearch({
        companyId: company.id,
        companySummary: "Manual entry without Research AI",
        whatTheySell: "Services",
        researchConfidence: "MEDIUM",
      });

      expect(saved.researchMethod).toBe("MANUAL");
      expect(saved.companySummary).toBe("Manual entry without Research AI");
      expect(saved.aiProvider).toBeNull();
      expect(saved.aiModel).toBeNull();

      await prisma.$disconnect();
    });
  },
);
