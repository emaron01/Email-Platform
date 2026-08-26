import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  contactResearch: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
}));

const generateStructured = vi.hoisted(() => vi.fn());

const aiMocks = vi.hoisted(() => ({
  getContactResearchAiProvider: vi.fn(() => ({ generateStructured })),
  getAiConfigPublicSummary: vi.fn(() => ({
    provider: "openai-responses",
    model: "research-model",
    modelUrlIdentifier: "openai-responses:research-model",
  })),
  getContactResearchAiConfig: vi.fn(() => ({
    provider: "openai-responses",
    model: "research-model",
  })),
  isContactResearchAiConfigured: vi.fn(() => true),
}));

const recordUsageEvent = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ai", () => aiMocks);
vi.mock("@/lib/usage/events", () => ({ recordUsageEvent }));

import { researchContactRole } from "@/lib/contact-research/service";

const POLICY = {
  maxSearchQueriesPerContact: 2,
  maxSourcesPerContact: 6,
  contactResearchFreshnessDays: 90,
};

function contactRow(title: string) {
  return {
    id: "contact_1",
    organizationId: "org_1",
    firstName: "Ada",
    lastName: "Ng",
    title,
    company: "Example Co",
    linkedinUrl: null,
  };
}

describe("contact research metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordUsageEvent.mockResolvedValue(undefined);
    aiMocks.isContactResearchAiConfigured.mockReturnValue(true);
    prismaMock.contact.findFirst.mockResolvedValue(contactRow("VP Infrastructure"));
    prismaMock.contactResearch.findFirst.mockResolvedValue(null);
  });

  it("records SKIPPED with triggerReason fresh-reuse and does not call AI", async () => {
    const freshResearch = {
      id: "research_1",
      organizationId: "org_1",
      contactId: "contact_1",
      status: "COMPLETED",
      researchMethod: "AUTOMATED",
      confidence: "HIGH",
      currentTitle: "VP Sales",
      roleSummary: "Owns the company forecast.",
      responsibilities: ["Runs forecast calls"],
      ownershipAreas: ["Revenue forecast"],
      professionalSignals: [],
      negativeRoleSignals: [],
      researchSources: [],
      researchedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      aiProvider: "test",
      aiModel: "research-model",
      aiModelUrlIdentifier: "test:research-model",
      promptVersion: "1",
      inputTokens: 100,
      outputTokens: 50,
      webSearchCallCount: 1,
      researchDurationMs: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.contact.findFirst.mockResolvedValue(contactRow("VP Sales"));
    prismaMock.contactResearch.findFirst.mockResolvedValue(freshResearch);

    const result = await researchContactRole({
      organizationId: "org_1",
      contactId: "contact_1",
      userId: "user_1",
      scoringRunId: "run_1",
      personaCriteria: [],
      policy: POLICY,
    });

    expect(result).toBe(freshResearch);
    expect(prismaMock.contactResearch.upsert).not.toHaveBeenCalled();
    expect(aiMocks.getContactResearchAiProvider).not.toHaveBeenCalled();
    expect(recordUsageEvent).toHaveBeenCalledTimes(1);
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        userId: "user_1",
        contactId: "contact_1",
        scoringRunId: "run_1",
        category: "CONTACT_RESEARCH",
        operation: "CONTACT_RESEARCH_SYNTHESIS",
        status: "SKIPPED",
        inputTokens: null,
        outputTokens: null,
        webSearchCalls: null,
        durationMs: 0,
        metadata: expect.objectContaining({ triggerReason: "fresh-reuse" }),
      }),
    );
  });

  it("records SKIPPED with triggerReason not_required for an unambiguous title", async () => {
    prismaMock.contact.findFirst.mockResolvedValue(contactRow("Chief Executive Officer"));
    prismaMock.contactResearch.upsert.mockResolvedValue({
      id: "research_nr",
      status: "NOT_REQUIRED",
    });

    await researchContactRole({
      organizationId: "org_1",
      contactId: "contact_1",
      personaCriteria: [],
      policy: POLICY,
    });

    expect(aiMocks.getContactResearchAiProvider).not.toHaveBeenCalled();
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
        metadata: expect.objectContaining({ triggerReason: "not_required" }),
      }),
    );
  });

  it("throws and records SKIPPED unconfigured instead of writing a fake PARTIAL row", async () => {
    aiMocks.isContactResearchAiConfigured.mockReturnValue(false);

    await expect(
      researchContactRole({
        organizationId: "org_1",
        contactId: "contact_1",
        personaCriteria: [
          {
            name: "Owns infrastructure",
            criterionType: "responsibility",
            dataType: "TEXT",
            operator: "EXISTS",
            importance: "HIGH",
            isRequired: false,
            isDisqualifier: false,
            sortOrder: 0,
          },
        ],
        policy: POLICY,
      }),
    ).rejects.toThrow(/Contact role research is not configured/);

    expect(prismaMock.contactResearch.upsert).not.toHaveBeenCalled();
    expect(aiMocks.getContactResearchAiProvider).not.toHaveBeenCalled();
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
        metadata: expect.objectContaining({ triggerReason: "unconfigured" }),
      }),
    );
  });

  it("records SUCCESS with triggerReason researched, tokens, and web search calls", async () => {
    generateStructured.mockResolvedValue({
      data: {
        roleSummary: "Owns platform reliability.",
        responsibilities: ["On-call"],
        ownershipAreas: ["Infrastructure"],
        professionalSignals: [],
        negativeRoleSignals: [],
        confidence: "HIGH",
        sources: [{ url: "https://example.test/about", supports: ["role"] }],
      },
      usage: { inputTokens: 80, outputTokens: 40, webSearchCalls: 2 },
    });
    prismaMock.contactResearch.upsert.mockResolvedValue({
      id: "research_new",
      status: "COMPLETED",
      confidence: "HIGH",
    });

    await researchContactRole({
      organizationId: "org_1",
      contactId: "contact_1",
      userId: "user_1",
      scoringRunId: "run_1",
      personaCriteria: [
        {
          name: "Owns infrastructure",
          criterionType: "responsibility",
          dataType: "TEXT",
          operator: "EXISTS",
          importance: "HIGH",
          isRequired: false,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
      policy: POLICY,
    });

    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "CONTACT_RESEARCH",
        operation: "CONTACT_RESEARCH_SYNTHESIS",
        status: "SUCCESS",
        inputTokens: 80,
        outputTokens: 40,
        webSearchCalls: 2,
        scoringRunId: "run_1",
        metadata: expect.objectContaining({ triggerReason: "researched" }),
      }),
    );
  });

  it("records FAILED with triggerReason researched when the provider throws", async () => {
    generateStructured.mockRejectedValue(new Error("provider down"));

    await expect(
      researchContactRole({
        organizationId: "org_1",
        contactId: "contact_1",
        personaCriteria: [
          {
            name: "Owns infrastructure",
            criterionType: "responsibility",
            dataType: "TEXT",
            operator: "EXISTS",
            importance: "HIGH",
            isRequired: false,
            isDisqualifier: false,
            sortOrder: 0,
          },
        ],
        policy: POLICY,
      }),
    ).rejects.toThrow("provider down");

    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        metadata: expect.objectContaining({ triggerReason: "researched" }),
      }),
    );
  });

  it("still returns reused research if metering itself fails", async () => {
    recordUsageEvent.mockRejectedValue(new Error("usage insert failed"));
    const freshResearch = {
      id: "research_1",
      organizationId: "org_1",
      contactId: "contact_1",
      status: "COMPLETED",
      confidence: "HIGH",
      roleSummary: "Owns the company forecast.",
      researchedAt: new Date(),
    };
    prismaMock.contact.findFirst.mockResolvedValue(contactRow("VP Sales"));
    prismaMock.contactResearch.findFirst.mockResolvedValue(freshResearch);

    const result = await researchContactRole({
      organizationId: "org_1",
      contactId: "contact_1",
      personaCriteria: [],
      policy: POLICY,
    });

    expect(result).toBe(freshResearch);
  });
});
