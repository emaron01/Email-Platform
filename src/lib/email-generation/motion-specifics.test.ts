import { describe, expect, it } from "vitest";
import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  bodyReferencesRequiredSpecific,
  buildPortfolioOfferingSpecific,
  collectMotionSpecificCandidates,
  countNamedOfferings,
  extractNamedOfferingLabels,
  isFirmographicResearchObjectPhrase,
  isLocationOnlyFragment,
  isUnusableEmailFirmographicPhrase,
  selectRequiredMotionSpecifics,
  splitResearchPhrases,
} from "@/lib/email-generation/motion-specifics";
import {
  buildEmailPrompt,
  emailPromptOptionsForContext,
} from "@/lib/email-generation/prompt";

const telecomResearch: EmailCompanyResearch = {
  companySummary:
    "MetroFiber Networks operates a facilities-based fiber-optic network across Greater Houston for commercial connectivity.",
  whatTheySell:
    "Dedicated Internet access, dark fiber, carrier wholesale services, and Cloud Connect",
  customerTypes: [
    "Carriers and wholesale providers",
    "Municipalities",
    "Enterprises",
  ],
  primaryMarkets: ["Greater Houston metropolitan area", "Texas"],
  businessModel:
    "Privately held facilities-based B2B telecommunications provider",
  companySizeContext: "Approximately 110 employees across regional offices",
  confidence: "HIGH",
};

const staffingResearch: EmailCompanyResearch = {
  companySummary:
    "Northline Staffing places skilled trades workers for industrial maintenance projects.",
  whatTheySell:
    "Contract skilled trades staffing, shutdown crews, and WeldRight certified welders",
  customerTypes: ["Industrial plant operators", "EPCs"],
  primaryMarkets: ["Gulf Coast refineries", "Louisiana"],
  businessModel: "B2B staffing and workforce services",
  companySizeContext: "About 85 recruiters and 2,400 contractors on assignment",
  confidence: "HIGH",
};

const multiProductWhatTheySell =
  "A B2B automotive-retail software suite: StoneEagleMENU for F&I presentations; StoneEagleMETRICS and METRICS SERVICE for dealership performance reporting; PENCILWRENCH for repair-documentation workflows; and StoneEagleDATA for transaction-level automotive market intelligence.";

describe("motion specifics candidates", () => {
  it("counts distinct named offerings by orthography, not a product-name list", () => {
    expect(countNamedOfferings(multiProductWhatTheySell)).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      extractNamedOfferingLabels(multiProductWhatTheySell).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      countNamedOfferings(
        "AI-powered order-entry capabilities marketed as FrameworkLTC+.",
      ),
    ).toBeLessThan(2);
  });

  it("builds a portfolio phrase when whatTheySell has multiple named offerings", () => {
    const portfolio = buildPortfolioOfferingSpecific(multiProductWhatTheySell);
    expect(portfolio).toMatch(/suite|spanning|StoneEagleMENU/i);
    expect(portfolio.toLowerCase()).not.toMatch(
      /^metrics service for dealership/,
    );
  });

  it("excludes firmographic size and directory phrases from email specifics", () => {
    expect(
      isFirmographicResearchObjectPhrase(
        "LinkedIn lists StoneEagle at 201–500 employees",
      ),
    ).toBe(true);
    expect(
      isFirmographicResearchObjectPhrase(
        "United States long-term care pharmacy market",
      ),
    ).toBe(false);
    expect(isLocationOnlyFragment("Greater Houston metropolitan area")).toBe(
      true,
    );
    expect(isLocationOnlyFragment("Texas")).toBe(true);
    expect(
      isLocationOnlyFragment("United States long-term care pharmacy market"),
    ).toBe(false);
    expect(isLocationOnlyFragment("Gulf Coast refineries")).toBe(false);
    expect(
      isUnusableEmailFirmographicPhrase("Greater Houston metropolitan area"),
    ).toBe(true);
    expect(
      collectMotionSpecificCandidates(telecomResearch).every(
        (item) =>
          item.sourceField !== "companySizeContext" &&
          !isUnusableEmailFirmographicPhrase(item.text),
      ),
    ).toBe(true);
    expect(
      collectMotionSpecificCandidates(telecomResearch).some((item) =>
        /houston|texas/i.test(item.text),
      ),
    ).toBe(false);
  });

  it("splits research phrases without knowing fact types", () => {
    expect(splitResearchPhrases("Dark fiber, Cloud Connect, and VoIP")).toEqual(
      expect.arrayContaining(["Dark fiber", "Cloud Connect", "VoIP"]),
    );
  });

  it("collects candidates from research structure fields only", () => {
    const candidates = collectMotionSpecificCandidates(telecomResearch);
    expect(candidates.some((row) => row.sourceField === "customerTypes")).toBe(
      true,
    );
    expect(candidates.some((row) => row.sourceField === "whatTheySell")).toBe(
      true,
    );
    expect(
      candidates.some((row) => /houston|texas/i.test(row.text)),
    ).toBe(false);
  });

  it("checks that the body references a required specific by name", () => {
    const specifics = [
      {
        text: "dark fiber",
        sourceField: "whatTheySell",
        whyItMatters: "Named offering",
      },
      {
        text: "Carriers and wholesale providers",
        sourceField: "customerTypes",
        whyItMatters: "Named customer type",
      },
    ];
    expect(
      bodyReferencesRequiredSpecific(
        "Hi Pat,\n\nOn dark fiber deals, forecast stages can hide missing evidence.\n\nWant a look?",
        specifics,
      ),
    ).toBe(true);
    expect(
      bodyReferencesRequiredSpecific(
        "Hi Pat,\n\nComplex B2B deals make forecasts hard to trust.\n\nWant a demo?",
        specifics,
      ),
    ).toBe(false);
  });

  it("lexical fallback selects StoneEagle portfolio-style offerings for a forecast product", () => {
    const research: EmailCompanyResearch = {
      companySummary: "Dealer software vendor.",
      whatTheySell: multiProductWhatTheySell,
      customerTypes: ["auto dealer groups"],
      primaryMarkets: ["United States automotive retail"],
      businessModel: "B2B software licensed to dealer groups",
      companySizeContext: "201–500 employees",
      confidence: "HIGH",
    };
    const selected = selectRequiredMotionSpecifics({
      research,
      problemSpace: {
        problemsSolved: [
          "Forecast stages hide missing buyer evidence",
          "Managers spend time on status instead of coaching",
        ],
        painPoints: [
          "Hard to trust the forecast",
          "Revenue risk is hard to see early",
        ],
      },
      contactTitle: "Founder",
    });
    expect(selected.length).toBeGreaterThanOrEqual(2);
    expect(selected.map((item) => item.text).join(" ")).toMatch(
      /auto dealer|automotive retail|dealer groups|B2B software/i,
    );
    // Zero-relevance multi-SKU portfolio must not be forced for an unrelated problem space.
    expect(
      selected.some((item) =>
        /StoneEagleMENU.*PENCILWRENCH|spanning StoneEagleMENU/i.test(item.text),
      ),
    ).toBe(false);
  });

  it("rejects zero-relevance SoftWriters portfolio for an infrastructure problem space", () => {
    const research: EmailCompanyResearch = {
      companySummary: "LTC pharmacy software vendor.",
      whatTheySell:
        "A suite of LTC pharmacy products: FrameworkLTC, FrameworkECM, FrameworkFlow, FrameworkVision, and FrameworkRxP",
      customerTypes: [
        "Long-term care pharmacy operators",
        "Institutional pharmacies serving distributed care facilities",
      ],
      primaryMarkets: ["United States long-term care pharmacy market"],
      businessModel: "B2B software for pharmacy operators",
      companySizeContext: "201–500 employees",
      confidence: "HIGH",
    };
    const selected = selectRequiredMotionSpecifics({
      research,
      problemSpace: {
        problemsSolved: [
          "Lack of end-to-end visibility across distributed operational sites",
          "Network policy drift and compliance gaps between locations",
        ],
        painPoints: [
          "Limited visibility into what is happening at remote facilities",
          "Inconsistent network posture between sites",
        ],
      },
      contactTitle: "VP Infrastructure",
    });
    expect(
      selected.some((item) => /FrameworkLTC|FrameworkECM|suite spanning/i.test(item.text)),
    ).toBe(false);
    expect(selected.length).toBeGreaterThanOrEqual(1);
    expect(selected.map((item) => item.text).join(" ")).toMatch(
      /long-term care|pharmacy|distributed/i,
    );
  });
});

function promptContext(
  research: EmailCompanyResearch,
): EmailGenerationContext {
  return {
    organizationId: "org_1",
    userId: "user_1",
    campaignContact: {
      id: "cc_1",
      campaignId: "campaign_1",
      contactId: "contact_1",
    },
    campaign: {
      id: "campaign_1",
      name: "Outreach",
      offerName: "Working session",
      offerDescription: "A 20-minute review",
      offerCta: "Reply with a time that works",
      offerNotes: null,
      offerValidationJson: null,
      offerValidationHash: null,
      emailLength: "MEDIUM",
      emailGuidance: null,
    },
    emailLength: "MEDIUM",
    contact: {
      id: "contact_1",
      companyId: "company_1",
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex@example.test",
      title: "Leader",
      company: "Example Co",
      industry: null,
      location: null,
    },
    product: {
      id: "product_1",
      name: "Example Product",
      description: "Helps operators see what is actually happening",
      valueProposition: "Fewer surprises in daily operations",
      evidence: ["Published product fact: configurable workflow."],
      problemsSolved: [
        "Forecast stages hide missing buyer evidence",
        "Managers spend time on status instead of coaching",
      ],
      messaging: {
        primaryPositioning: [],
        coreValueThemes: [],
        strongestDifferentiators: [],
        proofPoints: [],
        supportedClaims: ["Improves visibility into current work"],
        claimsNotToMake: ["Guaranteed results"],
        terminologyToUse: [],
        terminologyToAvoid: [],
      },
    },
    persona: {
      id: "persona_1",
      name: "Operator",
      painPoints: [
        "Hard to trust the forecast",
        "Revenue risk is hard to see early",
      ],
      desiredOutcomes: ["A shared picture of what is true"],
      messagingNotes: ["Lead with forecast trust, not product mechanism"],
      messaging: {
        positioning: [],
        proofPoints: [],
        objections: [],
      },
      profile: {
        terminology: [],
        organizationalPressures: [],
        buyingRole: [],
        decisionInfluence: [],
      },
    },
    icp: {
      id: "icp_1",
      name: "Operators",
      definition: null,
      description: null,
    },
    contactResearch: null,
    companyResearch: research,
    companyResearchUpdatedAt: "2026-08-28T12:00:00.000Z",
    excludedCopySignals: {
      riskSignals: [],
      professionalSignals: [],
      negativeRoleSignals: [],
    },
    personaResolution: {
      source: "campaign_fallback",
      usedCampaignFallback: true,
    },
    sequence: [],
    voiceSamples: [],
  };
}

describe("requiredMotionSpecifics in prompt", () => {
  it("passes supplied specifics and rationales into the generation payload", () => {
    const telecomContext = promptContext(telecomResearch);
    const staffingContext = promptContext(staffingResearch);
    const telecomSpecifics = [
      {
        text: "dark fiber",
        sourceField: "whatTheySell",
        whyItMatters: "Named carrier offering relevant to network operations.",
      },
    ];
    const staffingSpecifics = [
      {
        text: "WeldRight certified welders",
        sourceField: "whatTheySell",
        whyItMatters: "Skilled-trades staffing motion for plant operators.",
      },
    ];
    const telecomPrompt = buildEmailPrompt(
      telecomContext,
      emailPromptOptionsForContext(telecomContext, telecomSpecifics),
    )[1].content;
    const staffingPrompt = buildEmailPrompt(
      staffingContext,
      emailPromptOptionsForContext(staffingContext, staffingSpecifics),
    )[1].content;
    expect(telecomPrompt).toContain('"requiredMotionSpecifics"');
    expect(staffingPrompt).toContain('"requiredMotionSpecifics"');
    expect(telecomPrompt).toContain("dark fiber");
    expect(staffingPrompt).toContain("WeldRight certified welders");
    expect(telecomPrompt).not.toMatch(/WeldRight|Louisiana refiner/i);
    expect(staffingPrompt).not.toMatch(/Greater Houston|dark fiber/i);
    expect(telecomPrompt).toContain("Reason FROM");
    expect(telecomPrompt).toContain(
      "Named carrier offering relevant to network operations.",
    );
  });
});
