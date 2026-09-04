import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import { clearFactSelectionCache } from "@/lib/email-generation/fact-selection-cache";
import { collectMotionSpecificCandidates } from "@/lib/email-generation/motion-specifics";

const generateStructured = vi.hoisted(() => vi.fn());
const getEmailFactsAiConfig = vi.hoisted(() =>
  vi.fn(() => ({ maxRetries: 0 })),
);
const getEmailFactsAiProvider = vi.hoisted(() =>
  vi.fn(() => ({ generateStructured })),
);

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    getEmailFactsAiConfig,
    getEmailFactsAiProvider,
  };
});

import {
  buildFactSelectionFingerprints,
  estimateFactSelectionCostUsd,
  selectRelevantCompanyFacts,
} from "@/lib/email-generation/semantic-fact-selector";

const salesLeaderProduct = {
  problemsSolved: [
    "Forecast stages hide missing buyer evidence",
    "Managers spend time on status instead of coaching",
  ],
};

const salesLeaderPersona = {
  name: "Chief Revenue Officer",
  painPoints: [
    "Hard to trust the forecast",
    "Revenue risk is hard to see early",
  ],
  desiredOutcomes: ["A defensible commit number"],
};

const infrastructureProduct = {
  problemsSolved: [
    "Lack of end-to-end visibility across distributed operational sites",
    "Network policy drift and compliance gaps between locations",
  ],
};

const vpInfrastructurePersona = {
  name: "VP Infrastructure",
  painPoints: [
    "Limited visibility into what is happening at remote facilities",
    "Inconsistent network posture between sites",
  ],
  desiredOutcomes: [
    "Centralized operational visibility without dispatching engineers everywhere",
    "Uniform compliance enforcement across locations",
  ],
};

const financeHrProduct = {
  problemsSolved: [
    "Payroll adjustments are reconciled manually across entities",
    "Benefits eligibility errors surface only after enrollment closes",
  ],
};

const financeHrPersona = {
  name: "VP People Operations",
  painPoints: [
    "Payroll exceptions take days to trace across systems",
    "Open enrollment corrections create compliance exposure",
  ],
  desiredOutcomes: [
    "Single source of truth for payroll and benefits changes",
    "Fewer retroactive enrollment fixes",
  ],
};

const softWritersResearch: EmailCompanyResearch = {
  companySummary:
    "SoftWriters supplies software and services to long-term care pharmacies.",
  whatTheySell:
    "FrameworkLTC pharmacy management; eRx remote dispensing workflows; clinical consulting; billing services",
  customerTypes: [
    "Long-term care pharmacy operators",
    "Institutional pharmacies serving distributed care facilities",
  ],
  primaryMarkets: ["United States long-term care pharmacy market"],
  businessModel: "B2B software and services for pharmacy operators",
  companySizeContext: "201–500 employees",
  confidence: "HIGH",
};

const telecomResearch: EmailCompanyResearch = {
  companySummary: "MetroFiber operates fiber networks.",
  whatTheySell: "Dedicated Internet access, dark fiber, and Cloud Connect",
  customerTypes: ["Carriers and wholesale providers", "Municipalities"],
  primaryMarkets: ["Greater Houston metropolitan area"],
  businessModel: "Facilities-based B2B telecommunications provider",
  companySizeContext: "Approximately 110 employees",
  confidence: "HIGH",
};

const payrollVendorResearch: EmailCompanyResearch = {
  companySummary: "Northwind Payroll serves multi-entity employers.",
  whatTheySell:
    "Payroll processing platform; time-and-attendance modules; garnishment administration",
  customerTypes: ["Multi-state employers with hourly workforces"],
  primaryMarkets: ["Mid-market employers in regulated industries"],
  businessModel: "B2B payroll and workforce compliance software",
  companySizeContext: "About 320 employees",
  confidence: "HIGH",
};

function mockSelection(
  selected: Array<{ candidateId: string; rationale: string }>,
  noneRelevant = false,
) {
  generateStructured.mockResolvedValueOnce({
    data: { noneRelevant, selected },
    provider: "openai-responses",
    model: "facts-test-model",
    usage: { inputTokens: 800, outputTokens: 120 },
  });
}

function candidateId(
  research: EmailCompanyResearch,
  match: (row: { sourceField: string; text: string }) => boolean,
): string {
  const candidates = collectMotionSpecificCandidates(research);
  const index = candidates.findIndex(match);
  if (index < 0) {
    throw new Error("candidate not found");
  }
  return `c${index}`;
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org_1",
    companyId: "company_softwriters",
    productId: "product_nom",
    personaId: "persona_vp_infra",
    contactTitle: "VP Infrastructure",
    product: infrastructureProduct,
    persona: vpInfrastructurePersona,
    research: softWritersResearch,
    researchUpdatedAt: "2026-08-28T12:00:00.000Z",
    skipCache: true,
    ...overrides,
  };
}

describe("selectRelevantCompanyFacts", () => {
  beforeEach(() => {
    clearFactSelectionCache();
    generateStructured.mockReset();
    getEmailFactsAiConfig.mockClear();
    getEmailFactsAiConfig.mockImplementation(() => ({ maxRetries: 0 }));
    getEmailFactsAiProvider.mockReset();
    getEmailFactsAiProvider.mockImplementation(() => ({ generateStructured }));
  });

  afterEach(() => {
    clearFactSelectionCache();
  });

  it("does not select a distinctive product portfolio for an infrastructure buyer", async () => {
    const candidates = collectMotionSpecificCandidates(softWritersResearch);
    const portfolio = candidates.find((row) => row.sourceField === "whatTheySell");
    expect(portfolio).toBeTruthy();
    mockSelection([
      {
        candidateId: candidateId(
          softWritersResearch,
          (row) => row.sourceField === "customerTypes" && /distributed care/i.test(row.text),
        ),
        rationale:
          "Institutional pharmacies operating distributed care facilities face the same multi-site visibility and compliance burden this role owns.",
      },
    ]);

    const result = await selectRelevantCompanyFacts(baseInput());

    expect(result.noneRelevant).toBe(false);
    expect(result.specifics).toHaveLength(1);
    expect(result.specifics[0]?.sourceField).toBe("customerTypes");
    expect(result.specifics[0]?.text).toMatch(/distributed care facilities/i);
    expect(result.specifics.some((row) => row.sourceField === "whatTheySell")).toBe(
      false,
    );
  });

  it("selects a relevant fact with no lexical overlap to persona pain points", async () => {
    mockSelection([
      {
        candidateId: candidateId(
          softWritersResearch,
          (row) => row.sourceField === "customerTypes" && /long-term care pharmacy operators/i.test(row.text),
        ),
        rationale:
          "Operators serving many distributed care facilities need the same cross-site visibility this product provides, even though the vocabulary differs.",
      },
    ]);

    const result = await selectRelevantCompanyFacts(baseInput());
    const painText = vpInfrastructurePersona.painPoints.join(" ").toLowerCase();
    const factText = result.specifics[0]?.text.toLowerCase() ?? "";
    const factTokens = new Set(factText.split(/\W+/).filter(Boolean));
    const painTokens = painText.split(/\W+/).filter(Boolean);
    const overlap = painTokens.filter((token) => factTokens.has(token));
    expect(overlap).toEqual([]);
    expect(result.specifics[0]?.text).toMatch(/long-term care pharmacy operators/i);
  });

  it("skips with an explicit reason when EMAIL_FACTS_AI is not configured", async () => {
    const { AiConfigError } = await import("@/lib/ai");
    getEmailFactsAiConfig.mockImplementationOnce(() => {
      throw new AiConfigError("missing");
    });

    const result = await selectRelevantCompanyFacts(baseInput());
    expect(result.skipReason).toBe("EMAIL_FACTS_AI not configured");
    expect(result.specifics).toEqual([]);
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.usage.provider).toBe("skipped");
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("degrades to skip when the provider rejects the role at construction", async () => {
    const { AiProviderError } = await import("@/lib/ai");
    getEmailFactsAiProvider.mockImplementationOnce(() => {
      throw new AiProviderError(
        'openai-responses adapter does not support role "email_facts"',
        { retryable: false },
      );
    });

    const result = await selectRelevantCompanyFacts(baseInput());
    expect(result.skipReason).toBe("selector failed");
    expect(result.specifics).toEqual([]);
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.usage.provider).toBe("skipped");
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("degrades to skip when generateStructured throws a non-retryable error", async () => {
    const { AiProviderError } = await import("@/lib/ai");
    generateStructured.mockRejectedValueOnce(
      new AiProviderError("upstream failed", { retryable: false }),
    );

    const result = await selectRelevantCompanyFacts(baseInput());
    expect(result.skipReason).toBe("selector failed");
    expect(result.specifics).toEqual([]);
    expect(result.candidateCount).toBeGreaterThan(0);
  });

  it("returns none for a sales-leader product when only infrastructure evidence exists", async () => {
    mockSelection([], true);

    const result = await selectRelevantCompanyFacts(
      baseInput({
        productId: "product_forecast",
        personaId: "persona_cro",
        product: salesLeaderProduct,
        persona: salesLeaderPersona,
        research: telecomResearch,
        companyId: "company_telecom",
      }),
    );

    expect(result.specifics).toEqual([]);
    expect(result.noneRelevant).toBe(true);
  });

  it("can select relevant facts for a finance/HR buyer from payroll vendor research", async () => {
    mockSelection([
      {
        candidateId: candidateId(
          payrollVendorResearch,
          (row) => row.sourceField === "customerTypes",
        ),
        rationale:
          "Multi-state hourly employers create the payroll exception volume and compliance exposure this persona is trying to eliminate.",
      },
    ]);

    const result = await selectRelevantCompanyFacts(
      baseInput({
        productId: "product_payroll",
        personaId: "persona_people_ops",
        product: financeHrProduct,
        persona: financeHrPersona,
        research: payrollVendorResearch,
        companyId: "company_payroll_vendor",
      }),
    );

    expect(result.specifics).toHaveLength(1);
    expect(result.specifics[0]?.text).toMatch(/multi-state employers/i);
  });

  it("reports NOM-style infrastructure selection against SoftWriters research", async () => {
    mockSelection([
      {
        candidateId: candidateId(
          softWritersResearch,
          (row) => /long-term care pharmacy operators/i.test(row.text),
        ),
        rationale:
          "Long-term care pharmacy operators running distributed facilities need centralized visibility across sites, which matches this infrastructure buyer's mandate.",
      },
      {
        candidateId: candidateId(
          softWritersResearch,
          (row) => /distributed care facilities/i.test(row.text),
        ),
        rationale:
          "Institutional pharmacies serving many care locations face network and compliance sprawl between sites.",
      },
    ]);

    const result = await selectRelevantCompanyFacts(baseInput());
    expect(result.specifics.map((row) => row.text)).toEqual([
      "Long-term care pharmacy operators",
      "Institutional pharmacies serving distributed care facilities",
    ]);
    expect(
      result.specifics.every((row) => row.sourceField === "customerTypes"),
    ).toBe(true);
    expect(
      result.specifics.every((row) => row.whyItMatters.trim().length > 10),
    ).toBe(true);
  });

  it("caches selection per company, product, persona, and content fingerprints", async () => {
    mockSelection([
      {
        candidateId: candidateId(
          softWritersResearch,
          (row) => /distributed care facilities/i.test(row.text),
        ),
        rationale: "Distributed facilities imply multi-site infrastructure pain.",
      },
    ]);

    const first = await selectRelevantCompanyFacts({
      ...baseInput(),
      skipCache: false,
    });
    const second = await selectRelevantCompanyFacts({
      ...baseInput(),
      skipCache: false,
    });

    expect(first.usage?.cached).toBe(false);
    expect(second.usage?.cached).toBe(true);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(second.cacheKey).toMatch(/^org_1\|company_softwriters\|product_nom\|persona_vp_infra\|/);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache when research, product, or persona fingerprints change", () => {
    const fingerprints = buildFactSelectionFingerprints({
      research: softWritersResearch,
      researchUpdatedAt: "2026-08-28T12:00:00.000Z",
      product: infrastructureProduct,
      persona: vpInfrastructurePersona,
    });
    const changedResearch = buildFactSelectionFingerprints({
      research: {
        ...softWritersResearch,
        customerTypes: ["Hospital outpatient pharmacies"],
      },
      researchUpdatedAt: "2026-08-28T12:00:00.000Z",
      product: infrastructureProduct,
      persona: vpInfrastructurePersona,
    });
    const changedProduct = buildFactSelectionFingerprints({
      research: softWritersResearch,
      researchUpdatedAt: "2026-08-28T12:00:00.000Z",
      product: {
        problemsSolved: [...infrastructureProduct.problemsSolved, "New problem"],
      },
      persona: vpInfrastructurePersona,
    });
    const changedPersona = buildFactSelectionFingerprints({
      research: softWritersResearch,
      researchUpdatedAt: "2026-08-28T12:00:00.000Z",
      product: infrastructureProduct,
      persona: {
        ...vpInfrastructurePersona,
        painPoints: [...vpInfrastructurePersona.painPoints, "New pain"],
      },
    });

    expect(changedResearch.researchFingerprint).not.toBe(
      fingerprints.researchFingerprint,
    );
    expect(changedProduct.productFingerprint).not.toBe(
      fingerprints.productFingerprint,
    );
    expect(changedPersona.personaFingerprint).not.toBe(
      fingerprints.personaFingerprint,
    );
  });

  it("estimates marginal fact-selection cost from token usage", () => {
    expect(
      estimateFactSelectionCostUsd({
        provider: "openai-responses",
        model: "facts-test-model",
        inputTokens: 1000,
        outputTokens: 150,
        cached: false,
        durationMs: 400,
      }),
    ).toBeCloseTo(0.00024, 5);
    expect(
      estimateFactSelectionCostUsd({
        provider: "cache",
        model: "cache",
        inputTokens: 0,
        outputTokens: 0,
        cached: true,
        durationMs: 0,
      }),
    ).toBe(0);
  });
});
