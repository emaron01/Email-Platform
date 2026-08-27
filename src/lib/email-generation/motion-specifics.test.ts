import { describe, expect, it } from "vitest";
import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import {
  bodyReferencesRequiredSpecific,
  buildPortfolioOfferingSpecific,
  collectMotionSpecificCandidates,
  countNamedOfferings,
  extractNamedOfferingLabels,
  isFirmographicResearchObjectPhrase,
  isLocationOnlyFragment,
  isUnusableEmailFirmographicPhrase,
  scoreMotionSpecificUsability,
  selectRequiredMotionSpecifics,
  splitResearchPhrases,
} from "@/lib/email-generation/motion-specifics";
import { buildEmailPrompt } from "@/lib/email-generation/prompt";
import type { EmailGenerationContext } from "@/lib/email-generation/context";

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

const problemSpaceForecast = {
  problemsSolved: [
    "Forecast stages hide missing buyer evidence",
    "Managers spend time on status instead of coaching",
  ],
  painPoints: [
    "Hard to trust the forecast",
    "Revenue risk is hard to see early",
  ],
};

const problemSpaceStaffingOps = {
  problemsSolved: ["Missed handoffs between crews and planners"],
  painPoints: ["Incomplete status on who is actually on site"],
};

const multiProductWhatTheySell =
  "A B2B automotive-retail software suite: StoneEagleMENU for F&I presentations; StoneEagleMETRICS and METRICS SERVICE for dealership performance reporting; PENCILWRENCH for repair-documentation workflows; and StoneEagleDATA for transaction-level automotive market intelligence.";

describe("motion specifics selection", () => {
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

  it("prefers the portfolio over a single SKU when whatTheySell has multiple named offerings", () => {
    const research: EmailCompanyResearch = {
      companySummary: "Dealer software vendor.",
      whatTheySell: multiProductWhatTheySell,
      customerTypes: ["auto dealer groups"],
      primaryMarkets: ["United States automotive retail"],
      businessModel: "B2B software licensed to dealer groups",
      companySizeContext: "201–500 employees",
      confidence: "HIGH",
    };
    const portfolio = buildPortfolioOfferingSpecific(multiProductWhatTheySell);
    expect(portfolio).toMatch(/suite|spanning|StoneEagleMENU/i);
    expect(portfolio.toLowerCase()).not.toMatch(
      /^metrics service for dealership/,
    );
    const selected = selectRequiredMotionSpecifics({
      research,
      problemSpace: problemSpaceForecast,
      contactTitle: "Founder",
    });
    const whatTheySell = selected.filter(
      (item) => item.sourceField === "whatTheySell",
    );
    expect(whatTheySell.length).toBe(1);
    expect(whatTheySell[0].text).toMatch(/suite|spanning/i);
    expect(whatTheySell[0].whyItMatters).toMatch(/portfolio/i);
    expect(
      selected.some((item) =>
        /^METRICS SERVICE for dealership/i.test(item.text),
      ),
    ).toBe(false);
  });

  it("rejects generic catalog phrases without a build-time domain list", () => {
    const generic = {
      text: "Cloud Platform",
      sourceField: "whatTheySell",
      tokens: ["cloud", "platform"],
    };
    const suite = {
      text: "Analytics Suite",
      sourceField: "whatTheySell",
      tokens: ["analytics", "suite"],
    };
    expect(
      scoreMotionSpecificUsability(generic, {
        problemSpace: problemSpaceForecast,
      }),
    ).toBe(-Infinity);
    expect(
      scoreMotionSpecificUsability(suite, {
        problemSpace: problemSpaceForecast,
      }),
    ).toBe(-Infinity);
  });

  it("selects concrete named offerings and markets for a telecom-like company", () => {
    const selected = selectRequiredMotionSpecifics({
      research: telecomResearch,
      problemSpace: problemSpaceForecast,
      contactTitle: "VP of Sales - Carrier/Wholesale & Enterprise",
    });
    expect(selected.length).toBeGreaterThanOrEqual(2);
    expect(selected.length).toBeLessThanOrEqual(3);
    const joined = selected.map((item) => item.text.toLowerCase()).join(" ");
    // Title-dominated carrier/wholesale/enterprise alone should not be the only evidence.
    expect(joined).toMatch(
      /fiber|dark|municipal|dedicated internet|telecommunications/i,
    );
    expect(joined).not.toMatch(/110|employee|linkedin|houston|texas/i);
    for (const item of selected) {
      expect(item.whyItMatters.length).toBeGreaterThan(10);
      expect(["whatTheySell", "customerTypes", "primaryMarkets", "businessModel"]).toContain(
        item.sourceField,
      );
    }
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
    const selected = selectRequiredMotionSpecifics({
      research: telecomResearch,
      problemSpace: problemSpaceForecast,
      contactTitle: "VP Sales",
    });
    expect(
      selected.every((item) => !isUnusableEmailFirmographicPhrase(item.text)),
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

  it("selects concrete specifics for an unrelated staffing domain without shared vocabulary", () => {
    const selected = selectRequiredMotionSpecifics({
      research: staffingResearch,
      problemSpace: problemSpaceStaffingOps,
      contactTitle: "Director of Plant Operations",
    });
    expect(selected.length).toBeGreaterThanOrEqual(2);
    const joined = selected.map((item) => item.text.toLowerCase()).join(" ");
    expect(joined).toMatch(/weldright|refiner|shutdown/i);
    expect(joined).not.toMatch(/fiber|houston|telecom|2,?400|employee|^louisiana$| louisiana /i);
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
    // Pure location primaryMarkets are dropped; offerings/customers remain.
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
      problemsSolved: problemSpaceForecast.problemsSolved,
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
      painPoints: problemSpaceForecast.painPoints,
      desiredOutcomes: ["A shared picture of what is true"],
      messagingNotes: [
        "Lead with forecast trust, not product mechanism",
      ],
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
  it("passes a required list for two unrelated domains without cross-domain bleed", () => {
    const telecomPrompt = buildEmailPrompt(promptContext(telecomResearch))[1]
      .content;
    const staffingPrompt = buildEmailPrompt(promptContext(staffingResearch))[1]
      .content;
    expect(telecomPrompt).toContain('"requiredMotionSpecifics"');
    expect(staffingPrompt).toContain('"requiredMotionSpecifics"');
    expect(telecomPrompt).toMatch(/fiber|dark fiber|municipal|Dedicated Internet/i);
    expect(staffingPrompt).toMatch(/WeldRight|refiner/i);
    expect(telecomPrompt).not.toMatch(/WeldRight|Louisiana refiner/i);
    expect(staffingPrompt).not.toMatch(/Greater Houston|dark fiber/i);
    expect(telecomPrompt).toContain("Reason FROM");
    const requiredBlock =
      telecomPrompt.match(
        /"requiredMotionSpecifics": \[[\s\S]*?\],\s*"requiredMotionSpecificsInstruction"/,
      )?.[0] ?? "";
    expect(requiredBlock.length).toBeGreaterThan(20);
    expect(requiredBlock).not.toMatch(
      /110 employees|LinkedIn|Greater Houston|Texas/i,
    );
  });
});
