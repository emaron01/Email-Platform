import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  contactResearch: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
}));

const aiMocks = vi.hoisted(() => ({
  getContactResearchAiProvider: vi.fn(),
  getAiConfigPublicSummary: vi.fn(),
  isContactResearchAiConfigured: vi.fn(() => true),
}));

const recordUsageEvent = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ai", () => aiMocks);
vi.mock("@/lib/usage/events", () => ({ recordUsageEvent }));

import { researchContactRole } from "@/lib/contact-research/service";

describe("contact research reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fresh completed research unchanged without an AI call", async () => {
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
    prismaMock.contact.findFirst.mockResolvedValue({
      id: "contact_1",
      organizationId: "org_1",
      title: "VP Sales",
    });
    prismaMock.contactResearch.findFirst.mockResolvedValue(freshResearch);

    const result = await researchContactRole({
      organizationId: "org_1",
      contactId: "contact_1",
      personaCriteria: [],
      policy: {
        maxSearchQueriesPerContact: 2,
        maxSourcesPerContact: 6,
        contactResearchFreshnessDays: 90,
      },
    });

    expect(result).toBe(freshResearch);
    expect(prismaMock.contactResearch.upsert).not.toHaveBeenCalled();
    expect(aiMocks.getContactResearchAiProvider).not.toHaveBeenCalled();
    expect(recordUsageEvent).not.toHaveBeenCalled();
  });
});
