import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  contactScore: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
const aiMocks = vi.hoisted(() => ({
  getScoringAiConfig: vi.fn(),
  getScoringAiProvider: vi.fn(),
}));
const generateScoringAssessment = vi.hoisted(() => vi.fn());
const recordUsageEvent = vi.hoisted(() => vi.fn());
const researchContactRole = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ai", () => aiMocks);
vi.mock("@/lib/scoring/ai-assessment", () => ({
  generateScoringAssessment,
}));
vi.mock("@/lib/org/authz", () => ({
  getCurrentUser: async () => ({ id: "user_1" }),
}));
vi.mock("@/lib/usage/events", () => ({ recordUsageEvent }));
vi.mock("@/lib/usage/policy", () => ({
  getResearchPolicy: async () => ({
    maxSearchQueriesPerContact: 2,
    maxSourcesPerContact: 6,
    contactResearchFreshnessDays: 90,
  }),
}));
vi.mock("@/lib/contact-research/service", () => ({
  researchContactRole,
}));
vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  TenantError: class TenantError extends Error {},
  requireOrganizationId: vi.fn(),
}));

import { scoreSingleContact } from "@/lib/scoring/engine";

describe("scoring engine persona exclusion short circuit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.contactScore.update.mockResolvedValue({});
    prismaMock.contactScore.findFirst.mockResolvedValue({
      id: "score_1",
      contactId: "contact_1",
      contact: {
        id: "contact_1",
        firstName: "Alex",
        lastName: "Seller",
        title: "Account Executive",
        company: "Acme",
        industry: "SaaS",
        employeeCount: 100,
        revenue: null,
        location: null,
        companyRecord: null,
      },
    });
  });

  it("disqualifies a confirmed TITLE_TESTABLE exclusion without calling AI", async () => {
    const result = await scoreSingleContact({
      organizationId: "org_1",
      scoringRunId: "run_1",
      contactScoreId: "score_1",
      product: {
        id: "product_1",
        name: "Forecasting",
        description: null,
        valueProposition: null,
        averageOrderValue: null,
        websiteUrl: null,
      },
      icp: {
        id: "icp_1",
        name: "SaaS",
        description: null,
        definition: null,
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria: [],
      },
      persona: {
        id: "persona_1",
        name: "Revenue Operations Leader",
        definition: null,
        targetTitles: ["VP Revenue Operations"],
        department: null,
        seniority: null,
        responsibilities: null,
        painPoints: null,
        desiredOutcomes: null,
        messagingNotes: null,
        criteria: [
          {
            id: "exclusion_1",
            name: "Individual selling role only",
            description: "Exclude account executives.",
            criterionType: "negative_role_signal",
            dataType: "TEXT",
            operator: "EXISTS",
            importance: "CRITICAL",
            isRequired: false,
            isDisqualifier: true,
            exclusionTestability: "TITLE_TESTABLE",
            sortOrder: 0,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(aiMocks.getScoringAiConfig).not.toHaveBeenCalled();
    expect(aiMocks.getScoringAiProvider).not.toHaveBeenCalled();
    expect(generateScoringAssessment).not.toHaveBeenCalled();
    expect(researchContactRole).not.toHaveBeenCalled();
    expect(prismaMock.contactScore.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scoringStatus: "COMPLETED",
          scoreLabel: "DISQUALIFIED",
          aiProvider: null,
          assessmentData: expect.objectContaining({
            aiSkipped: true,
            aiSkipReason: "CONFIRMED_PERSONA_EXCLUSION",
          }),
        }),
      }),
    );
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          aiSkipped: true,
          reason: "CONFIRMED_PERSONA_EXCLUSION",
        }),
      }),
    );
  });

  it("does not AI-score a title that matches no persona; marks needs-review instead", async () => {
    prismaMock.contactScore.findFirst.mockResolvedValue({
      id: "score_1",
      contactId: "contact_1",
      contact: {
        id: "contact_1",
        firstName: "Pat",
        lastName: "Founder",
        title: "Founder",
        company: "Acme",
        industry: "SaaS",
        employeeCount: 100,
        revenue: null,
        location: null,
        companyRecord: null,
      },
    });

    const cro = {
      id: "persona_cro",
      name: "Chief Revenue Officer",
      definition: null,
      targetTitles: ["CRO", "Chief Revenue Officer"],
      department: null,
      seniority: null,
      responsibilities: null,
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
      criteria: [],
    };
    const vp = {
      ...cro,
      id: "persona_vp",
      name: "VP of Sales",
      targetTitles: ["VP of Sales", "Vice President of Sales"],
    };

    const result = await scoreSingleContact({
      organizationId: "org_1",
      scoringRunId: "run_1",
      contactScoreId: "score_1",
      product: {
        id: "product_1",
        name: "Forecasting",
        description: null,
        valueProposition: null,
        averageOrderValue: null,
        websiteUrl: null,
      },
      icp: {
        id: "icp_1",
        name: "SaaS",
        description: null,
        definition: null,
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria: [],
      },
      persona: cro,
      personas: [cro, vp],
    });

    expect(result.ok).toBe(true);
    expect(generateScoringAssessment).not.toHaveBeenCalled();
    expect(researchContactRole).not.toHaveBeenCalled();
    expect(prismaMock.contactScore.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scoringStatus: "COMPLETED",
          scoreLabel: null,
          matchedPersonaId: null,
          assessmentData: expect.objectContaining({
            aiSkipped: true,
            aiSkipReason: "NO_TITLE_FIT",
            personaMatch: expect.objectContaining({ status: "UNKNOWN" }),
          }),
        }),
      }),
    );
  });

  it("calls AI only for the title-matching persona on an all-personas run", async () => {
    prismaMock.contactScore.findFirst.mockResolvedValue({
      id: "score_1",
      contactId: "contact_1",
      contact: {
        id: "contact_1",
        firstName: "Chris",
        lastName: "Revenue",
        title: "Chief Revenue Officer",
        company: "Acme",
        industry: "SaaS",
        employeeCount: 100,
        revenue: null,
        location: null,
        companyRecord: null,
      },
    });
    aiMocks.getScoringAiConfig.mockReturnValue({ maxRetries: 0 });
    aiMocks.getScoringAiProvider.mockReturnValue({});
    generateScoringAssessment.mockResolvedValue({
      data: {
        dimensions: [
          {
            dimension: "Role",
            component: "PERSONA",
            assessment: "STRONG",
            evidence: ["CRO title"],
            concerns: [],
            confidence: "HIGH",
          },
        ],
        fitStrengths: ["CRO"],
        fitRisks: [],
        potentialDisqualifiers: [],
        recommendedAction: "Pursue",
        reasoning: "Title matches CRO.",
      },
      provider: "openai",
      model: "test",
      modelUrlIdentifier: "test",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const cro = {
      id: "persona_cro",
      name: "Chief Revenue Officer",
      definition: null,
      targetTitles: ["CRO", "Chief Revenue Officer"],
      department: null,
      seniority: null,
      responsibilities: null,
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
      criteria: [],
    };
    const vp = {
      ...cro,
      id: "persona_vp",
      name: "VP of Sales",
      targetTitles: ["VP of Sales", "Vice President of Sales"],
    };

    const result = await scoreSingleContact({
      organizationId: "org_1",
      scoringRunId: "run_1",
      contactScoreId: "score_1",
      product: {
        id: "product_1",
        name: "Forecasting",
        description: null,
        valueProposition: null,
        averageOrderValue: null,
        websiteUrl: null,
      },
      icp: {
        id: "icp_1",
        name: "SaaS",
        description: null,
        definition: null,
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria: [],
      },
      persona: cro,
      personas: [cro, vp],
    });

    expect(result.ok).toBe(true);
    expect(generateScoringAssessment).toHaveBeenCalledTimes(1);
    expect(prismaMock.contactScore.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchedPersonaId: "persona_cro",
          assessmentData: expect.objectContaining({
            personaMatch: expect.objectContaining({
              status: "MATCHED",
              matchedPersonaId: "persona_cro",
            }),
          }),
        }),
      }),
    );
  });
});
