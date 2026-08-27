import { describe, expect, it } from "vitest";
import {
  describeCompanySourceLead,
  sourcesSupportingClaim,
  sourcesSupportingField,
} from "@/lib/research/company-briefing";
import type { ResearchSource } from "@/lib/research/types";

function source(
  partial: Partial<ResearchSource> & Pick<ResearchSource, "url">,
): ResearchSource {
  return {
    title: null,
    publisher: null,
    sourceType: "OTHER",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    supports: [],
    ...partial,
  };
}

describe("company briefing helpers", () => {
  it("describes mixed website and other sources", () => {
    const lead = describeCompanySourceLead({
      researchMethod: "AUTOMATED",
      sources: [
        source({
          url: "https://acme.com/about",
          sourceType: "COMPANY_WEBSITE",
          title: "About Acme",
        }),
        source({ url: "https://news.example.com/acme", title: "Acme in the news" }),
      ],
    });
    expect(lead.sentence).toMatch(/We read 2 sources/);
    expect(lead.sentence).toMatch(/company website/);
    expect(lead.names).toEqual(["About Acme", "Acme in the news"]);
  });

  it("maps field-level supports to chips", () => {
    const sources = [
      source({
        url: "https://acme.com",
        sourceType: "COMPANY_WEBSITE",
        supports: ["companySummary"],
        title: "Acme home",
      }),
    ];
    expect(sourcesSupportingField(sources, "companySummary")).toHaveLength(1);
    expect(
      sourcesSupportingClaim(sources, "Enterprise SaaS vendor", "companySummary"),
    ).toHaveLength(1);
  });

  it("notes manual briefings without sources", () => {
    expect(
      describeCompanySourceLead({
        researchMethod: "MANUAL",
        sources: [],
      }).sentence,
    ).toMatch(/entered manually/i);
  });
});

describe("company briefing page contracts", () => {
  it("reads as a document with edit behind a single action", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync(
      "src/app/(app)/companies/[companyId]/page.tsx",
      "utf8",
    );
    const briefing = readFileSync(
      "src/components/CompanyResearchBriefing.tsx",
      "utf8",
    );
    expect(page).toContain("CompanyResearchBriefing");
    expect(page).not.toContain("ManualCompanyResearchForm");
    expect(briefing).toContain('editing ? "Done editing" : "Edit"');
    expect(briefing).toContain("ManualCompanyResearchForm");
    expect(briefing).toContain("ExportPdfButton");
    expect(briefing).toContain("data-print-document");
    expect(briefing).not.toContain("Manual Research Override");
  });

  it("product profile exports via print dialog", async () => {
    const { readFileSync } = await import("node:fs");
    const product = readFileSync("src/components/ProductDraftReview.tsx", "utf8");
    const exportBtn = readFileSync("src/components/ExportPdfButton.tsx", "utf8");
    expect(product).toContain("ExportPdfButton");
    expect(product).toContain("data-print-document");
    expect(exportBtn).toContain("window.print");
  });
});
