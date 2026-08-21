import { describe, expect, it } from "vitest";
import { buildScoringPayload } from "@/lib/scoring/payload";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";

const product: ProductSnapshot = {
  id: "p",
  name: "P",
  description: "d",
  valueProposition: "v",
  averageOrderValue: null,
  websiteUrl: null,
};

const icp: IcpSnapshot = {
  id: "i",
  name: "I",
  description: null,
  definition: null,
  targetIndustries: ["SaaS"],
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
};

const persona: PersonaSnapshot = {
  id: "pe",
  name: "Pe",
  definition: null,
  targetTitles: ["CEO"],
  department: null,
  seniority: null,
  responsibilities: null,
  painPoints: null,
  desiredOutcomes: null,
  messagingNotes: null,
  criteria: [],
};

describe("scoring payload", () => {
  it("does not include email address", () => {
    const payload = buildScoringPayload({
      contact: {
        firstName: "Ann",
        lastName: "Alpha",
        title: "CEO",
        company: "Acme",
        industry: null,
        employeeCount: 100,
        revenue: null,
        location: null,
      },
      company: null,
      companyResearch: null,
      product,
      icp,
      persona,
      applicableDimensions: [],
    });

    expect(payload).not.toHaveProperty("email");
    expect(JSON.stringify(payload)).not.toMatch(/@/);
    expect(payload.researchIncomplete).toBe(true);
  });

  it("marks incomplete research without fabricating company facts", () => {
    const payload = buildScoringPayload({
      contact: {
        firstName: "Ann",
        lastName: "Alpha",
        title: "CEO",
        company: "Acme",
        industry: null,
        employeeCount: null,
        revenue: null,
        location: null,
      },
      company: {
        name: "Acme",
        website: "https://acme.com",
        normalizedDomain: "acme.com",
        industry: null,
        employeeCount: null,
        revenue: null,
        location: null,
      },
      companyResearch: {
        status: "NOT_STARTED",
        researchConfidence: null,
        companySummary: null,
        whatTheySell: null,
        customerTypes: [],
        primaryMarkets: [],
        businessModel: null,
        estimatedAov: null,
        aovReasoning: null,
        companySizeContext: null,
        relevantTechnologies: [],
        buyingSignals: [],
        riskSignals: [],
        researchedAt: null,
      },
      product,
      icp,
      persona,
      applicableDimensions: [],
    });

    expect(payload.researchIncomplete).toBe(true);
    expect(payload.companyResearch?.whatTheySell).toBeNull();
    expect(payload.companyResearch?.companySummary).toBeNull();
  });
});
