import { describe, expect, it } from "vitest";
import {
  finalizeResearchSources,
  researchSourceNearDedupeKey,
} from "@/lib/research/finalize-sources";
import {
  evaluateWebsiteFirstSufficiency,
  WEBSITE_FIRST_MIN_EXCERPT_CHARS,
} from "@/lib/research/website-first-sufficiency";
import type { ResearchSource } from "@/lib/research/types";

function source(
  partial: Partial<ResearchSource> & Pick<ResearchSource, "url" | "sourceType">,
): ResearchSource {
  return {
    title: null,
    publisher: null,
    retrievedAt: new Date().toISOString(),
    supports: [],
    ...partial,
  };
}

describe("website-first sufficiency", () => {
  const richExcerpt = "x".repeat(WEBSITE_FIRST_MIN_EXCERPT_CHARS);
  const richFields = {
    companySummary: "Acme builds operations software for mid-market teams.",
    whatTheySell: "Workflow automation for operations leaders.",
    customerTypes: ["Mid-market operations teams"],
    businessModel: "Subscription SaaS",
    companySizeContext: "200–500 employees",
  };

  it("fails when the website excerpt is thin even if fields look complete", () => {
    const result = evaluateWebsiteFirstSufficiency({
      websiteExcerptText: "Welcome to Acme.",
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [
            "companySummary",
            "whatTheySell",
            "customerTypes",
            "businessModel",
            "companySizeContext",
          ],
        }),
      ],
      fields: richFields,
    });
    expect(result.sufficient).toBe(false);
    expect(result.failReasons.some((r) => /excerpt too short/i.test(r))).toBe(
      true,
    );
  });

  it("fails when primary fields are filled but not grounded on website supports", () => {
    const result = evaluateWebsiteFirstSufficiency({
      websiteExcerptText: richExcerpt,
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [],
        }),
      ],
      fields: richFields,
    });
    expect(result.sufficient).toBe(false);
    expect(
      result.failReasons.some((r) => /supports only 0 primary/i.test(r)),
    ).toBe(true);
  });

  it("passes only when excerpt, primaries, website source, and supports all clear", () => {
    const result = evaluateWebsiteFirstSufficiency({
      websiteExcerptText: richExcerpt,
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [
            "companySummary",
            "whatTheySell",
            "customerTypes",
            "businessModel",
          ],
        }),
      ],
      fields: richFields,
    });
    expect(result.sufficient).toBe(true);
    expect(result.failReasons).toEqual([]);
  });
});

describe("finalizeResearchSources", () => {
  it("drops empty-support third-party URLs but keeps the official website", () => {
    const finalized = finalizeResearchSources({
      companyWebsiteUrl: "https://acme.example",
      companyDomain: "acme.example",
      maxSources: 8,
      sources: [
        source({
          url: "https://acme.example/",
          sourceType: "COMPANY_WEBSITE",
          supports: [],
        }),
        source({
          url: "https://linkedin.com/posts/acme-activity-1",
          sourceType: "LINKEDIN",
          supports: [],
        }),
        source({
          url: "https://news.example/acme-raises",
          sourceType: "NEWS",
          supports: ["buyingSignals"],
        }),
      ],
    });
    expect(finalized.map((s) => s.url).sort()).toEqual(
      [
        "https://acme.example/",
        "https://news.example/acme-raises",
      ].sort(),
    );
    expect(
      finalized.some((s) => s.url.includes("linkedin.com")),
    ).toBe(false);
  });

  it("near-dedupes LinkedIn posts about the same author, keeping supports", () => {
    expect(
      researchSourceNearDedupeKey(
        "https://www.linkedin.com/posts/stoneeagle-activity-111",
      ),
    ).toBe(
      researchSourceNearDedupeKey(
        "https://www.linkedin.com/posts/stoneeagle-activity-222",
      ),
    );
    const finalized = finalizeResearchSources({
      companyDomain: "stoneeagle.com",
      maxSources: 8,
      sources: [
        source({
          url: "https://linkedin.com/posts/stoneeagle-activity-1",
          sourceType: "LINKEDIN",
          supports: [],
        }),
        source({
          url: "https://linkedin.com/posts/stoneeagle-activity-2",
          sourceType: "LINKEDIN",
          supports: [],
        }),
        source({
          url: "https://linkedin.com/posts/stoneeagle-activity-3",
          sourceType: "LINKEDIN",
          supports: ["riskSignals"],
        }),
        source({
          url: "https://news.example/acquisition",
          sourceType: "NEWS",
          supports: ["riskSignals"],
        }),
      ],
    });
    const linkedin = finalized.filter((s) =>
      s.url.includes("linkedin.com"),
    );
    expect(linkedin).toHaveLength(1);
    expect(linkedin[0]?.supports).toEqual(["riskSignals"]);
  });

  it("ranks supporting news above unsupported linkedin before the cap", () => {
    const finalized = finalizeResearchSources({
      maxSources: 2,
      sources: [
        source({
          url: "https://linkedin.com/posts/a-activity-1",
          sourceType: "LINKEDIN",
          supports: ["riskSignals"],
        }),
        source({
          url: "https://reuters.com/acme",
          sourceType: "NEWS",
          supports: ["riskSignals", "buyingSignals"],
        }),
        source({
          url: "https://directory.example/acme",
          sourceType: "DIRECTORY",
          supports: ["companySummary"],
        }),
      ],
    });
    expect(finalized[0]?.url).toContain("reuters.com");
    expect(finalized).toHaveLength(2);
  });
});
