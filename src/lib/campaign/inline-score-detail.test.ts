import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  InlineScoreDetails,
  ScoreDetailPanel,
  type ScoreReportClientRow,
} from "@/components/ScoreDetailPanel";

function scoreRow(
  overrides: Partial<ScoreReportClientRow> = {},
): ScoreReportClientRow {
  return {
    id: "score_1",
    contactId: "contact_1",
    overallScore: 40,
    icpScore: 30,
    personaScore: null,
    companyScore: null,
    productRelevanceScore: null,
    scoreLabel: null,
    recommendedAction: "Review title",
    companySummary: "Sells widgets",
    whatTheySell: "Widgets",
    estimatedAov: null,
    aovReasoning: null,
    fitStrengths: ["Known buyer"],
    fitRisks: [],
    disqualifiers: [],
    reasoning: "Title is adjacent",
    researchStatus: "COMPLETED",
    researchSources: [],
    scoringStatus: "COMPLETED",
    assessmentData: {
      dimensions: [
        {
          dimension: "Title",
          assessment: "Partial",
          evidence: ["VP"],
          concerns: [],
        },
      ],
    },
    aiProvider: null,
    aiModel: "test-model",
    aiModelUrlIdentifier: null,
    promptVersion: "v1",
    scoringLogicVersion: "v2",
    scoredAt: "2026-01-01T00:00:00.000Z",
    scoringError: null,
    contact: {
      id: "contact_1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      title: "VP Sales",
      company: "Analytical Engines",
      companyId: "company_1",
      companyRecord: null,
    },
    ...overrides,
  };
}

describe("inline score detail", () => {
  it("renders company score detail inline without a navigation link", () => {
    const html = renderToStaticMarkup(
      createElement(InlineScoreDetails, {
        targetType: "COMPANY",
        rows: [scoreRow()],
      }),
    );
    expect(html).toContain("inline-score-detail-COMPANY-contact_1");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Qualification");
    expect(html).toContain("Score Breakdown");
    expect(html).toContain("Sells widgets");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Open company research page");
    expect(html).not.toContain("Open score detail");
  });

  it("renders contact score detail inline without a navigation link", () => {
    const html = renderToStaticMarkup(
      createElement(InlineScoreDetails, {
        targetType: "CONTACT",
        rows: [scoreRow()],
      }),
    );
    expect(html).toContain("inline-score-detail-CONTACT-contact_1");
    expect(html).toContain("Qualification");
    expect(html).toContain("Score Breakdown");
    expect(html).toContain("Title is adjacent");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Open score detail");
  });

  it("keeps the company research link on the score detail page panel", () => {
    const html = renderToStaticMarkup(
      createElement(ScoreDetailPanel, {
        row: scoreRow(),
        showSuppress: false,
      }),
    );
    expect(html).toContain('href="/companies/company_1"');
    expect(html).toContain("Open company research page");
    const report = readFileSync("src/components/ScoreReportClient.tsx", "utf8");
    expect(report).toContain("<ScoreDetailPanel row={row} />");
  });

  it("keeps stage 5 exceptions on the page and leaves move actions in place", () => {
    const manager = readFileSync(
      "src/components/CampaignContactsManager.tsx",
      "utf8",
    );
    const buckets = readFileSync(
      "src/components/QualificationBuckets.tsx",
      "utf8",
    );
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    const exceptions = manager.slice(
      manager.indexOf('data-testid="list-preparation-exceptions"'),
    );
    expect(exceptions.match(/<QualificationBuckets/g)).toHaveLength(1);
    expect(exceptions.match(/inlineScoreDetail/g)).toHaveLength(1);
    expect(exceptions).not.toContain("Companies that did not match");
    expect(exceptions).not.toContain("Open score detail");
    expect(exceptions).not.toContain("researchHref");

    expect(buckets).toContain("SHOW SCORE DETAIL");
    expect(buckets).toContain("HIDE SCORE DETAIL");
    expect(buckets).toContain('type="button"');
    expect(buckets).toContain("!inlineScoreDetail && row.researchHref");
    const moveAt = buckets.indexOf("Move to");
    const showAt = buckets.indexOf("SHOW SCORE DETAIL");
    expect(moveAt).toBeGreaterThan(0);
    expect(showAt).toBeGreaterThan(moveAt);
    expect(buckets.indexOf("EXCLUSION_REVIEW_COPY.addBack")).toBeLessThan(
      showAt,
    );

    const companiesStage = page.slice(
      page.indexOf('currentStage === "companies"'),
      page.indexOf('currentStage === "contacts"'),
    );
    const contactsStage = page.slice(
      page.indexOf('currentStage === "contacts"'),
      page.indexOf('currentStage === "report"'),
    );
    expect(companiesStage).toContain("<QualificationBuckets");
    expect(companiesStage).not.toContain("inlineScoreDetail");
    expect(contactsStage).toContain("<QualificationBuckets");
    expect(contactsStage).not.toContain("inlineScoreDetail");
  });
});
