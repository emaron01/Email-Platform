import { describe, expect, it, vi } from "vitest";
import type { AiProvider, AiStructuredRequest } from "@/lib/ai/types";
import type { AiScoringAssessment } from "@/lib/scoring/assessment";
import { generateScoringAssessment } from "@/lib/scoring/ai-assessment";
import { SCORING_PROMPT_VERSION } from "@/lib/scoring/config";
import { buildScoringPayload } from "@/lib/scoring/payload";

function payloadForOwnership(ownershipAreas: string[]) {
  return buildScoringPayload({
    contact: {
      firstName: "Alex",
      lastName: "Morgan",
      title: "VP Sales",
      company: "Acme",
      industry: "SaaS",
      employeeCount: 200,
      revenue: null,
      location: null,
    },
    contactResearch: {
      status: "COMPLETED",
      confidence: "HIGH",
      roleSummary: ownershipAreas.join(", "),
      responsibilities: ownershipAreas,
      ownershipAreas,
      professionalSignals: [],
      negativeRoleSignals: [],
      researchedAt: "2026-08-24T00:00:00.000Z",
    },
    company: null,
    companyResearch: null,
    product: {
      id: "product",
      name: "Forecasting",
      description: null,
      valueProposition: "Improve forecast accuracy",
      averageOrderValue: null,
      websiteUrl: null,
    },
    icp: {
      id: "icp",
      name: "SaaS",
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
    },
    persona: {
      id: "persona",
      name: "Forecast owner",
      definition: null,
      targetTitles: ["VP Sales"],
      department: "Sales",
      seniority: "VP",
      responsibilities: "Owns the company forecast",
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
      criteria: [],
    },
    applicableDimensions: [
      {
        component: "PERSONA",
        dimension: "Role / Responsibility Match",
      },
    ],
  });
}

describe("scoring AI contact-research evidence", () => {
  it("gives identical titles different persona assessments when researched ownership differs", async () => {
    const generateStructured = vi.fn(
      async (request: AiStructuredRequest<AiScoringAssessment>) => {
        const user = JSON.parse(request.messages[1]!.content) as {
          contactResearch: { ownershipAreas: string[] };
        };
        const ownsForecast = user.contactResearch.ownershipAreas.includes(
          "Owns the company forecast",
        );
        return {
          data: {
            dimensions: [
              {
                dimension: "Role / Responsibility Match",
                component: "PERSONA" as const,
                assessment: ownsForecast
                  ? ("STRONG" as const)
                  : ("NO_FIT" as const),
                evidence: user.contactResearch.ownershipAreas,
                concerns: [],
                confidence: "HIGH" as const,
              },
            ],
            fitStrengths: ownsForecast ? ["Owns forecast"] : [],
            fitRisks: ownsForecast
              ? []
              : ["Administers CRM without forecast ownership"],
            potentialDisqualifiers: [],
            recommendedAction: ownsForecast ? "Proceed" : "Exclude",
            reasoning: ownsForecast
              ? "Confirmed ownership"
              : "Ownership does not match",
          },
          rawText: "{}",
          provider: "test",
          model: "evidence-aware",
          modelUrlIdentifier: "test:evidence-aware",
        };
      },
    );
    const provider: AiProvider = {
      generateStructured:
        generateStructured as unknown as AiProvider["generateStructured"],
    };

    const forecastOwner = await generateScoringAssessment({
      provider,
      payload: payloadForOwnership(["Owns the company forecast"]),
      maxRetries: 0,
    });
    const crmAdmin = await generateScoringAssessment({
      provider,
      payload: payloadForOwnership(["Administers CRM configuration"]),
      maxRetries: 0,
    });

    expect(forecastOwner.data.dimensions[0]?.assessment).toBe("STRONG");
    expect(crmAdmin.data.dimensions[0]?.assessment).toBe("NO_FIT");
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(SCORING_PROMPT_VERSION).toBe("4");
    expect(
      generateStructured.mock.calls[0]?.[0].messages[0]?.content,
    ).toContain("ContactResearch as the primary evidence");
  });
});
