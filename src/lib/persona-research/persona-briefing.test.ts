import { describe, expect, it } from "vitest";
import {
  describePersonaSourceLead,
  formatPersonaBriefingMeta,
  groupPersonaCriteriaForBriefing,
  provenanceForClaim,
  resolvePersonaBriefingView,
} from "@/lib/persona-research/persona-briefing";

describe("persona briefing helpers", () => {
  it("describes product evidence and persona sources", () => {
    const lead = describePersonaSourceLead({
      includesProductEvidence: true,
      personaSources: [
        {
          id: "s1",
          sourceType: "UPLOADED_DOCUMENT",
          displayName: "Win notes",
          filename: "win-notes.pdf",
        },
        {
          id: "s2",
          sourceType: "URL",
          displayName: "LinkedIn profile",
          originalUrl: "https://example.com",
        },
      ],
    });
    expect(lead.sentence).toMatch(/approved product profile/i);
    expect(lead.sentence).toMatch(/uploaded document/i);
    expect(lead.names).toEqual(["win-notes.pdf", "LinkedIn profile"]);
  });

  it("resolves saved persona fields with profile json", () => {
    const view = resolvePersonaBriefingView({
      name: "Revenue leader",
      definition: "Owns forecast",
      targetTitles: ["CRO"],
      department: "Sales",
      seniority: "VP",
      profileJson: {
        roleSummary: "Executive owner of revenue",
        ownershipAreas: ["Forecast process"],
        painPoints: ["Manual roll-ups"],
        evidenceRefs: [
          {
            claim: "Executive owner of revenue",
            provenanceClasses: ["CUSTOMER_EVIDENCE"],
          },
        ],
        provenanceAssessments: [],
      },
    });
    expect(view.whoTheyAre).toBe("Executive owner of revenue");
    expect(view.ownershipAreas).toEqual(["Forecast process"]);
    expect(
      provenanceForClaim({
        claim: "Executive owner of revenue",
        evidenceRefs: [
          {
            claim: "Executive owner of revenue",
            provenanceClasses: ["CUSTOMER_EVIDENCE"],
          },
        ],
        provenanceAssessments: [],
      }),
    ).toEqual(["CUSTOMER_EVIDENCE"]);
  });

  it("groups criteria into qualifies, excludes, and needs review", () => {
    const groups = groupPersonaCriteriaForBriefing([
      {
        name: "Owns forecast",
        criterionType: "positive_role_signal",
        isDisqualifier: false,
        isRequired: true,
      },
      {
        name: "Marketing only",
        criterionType: "exclusion",
        isDisqualifier: true,
        isRequired: false,
      },
      {
        name: "Unclear scope",
        criterionType: "needs_review",
        isDisqualifier: false,
        isRequired: false,
      },
    ]);
    expect(groups.qualifies).toHaveLength(1);
    expect(groups.excludes).toHaveLength(1);
    expect(groups.needsReview).toHaveLength(1);
  });

  it("formats compact header meta", () => {
    expect(
      formatPersonaBriefingMeta({
        likelyTitles: ["CRO", "VP Sales"],
        department: "Sales",
        seniority: "VP",
      }),
    ).toBe("CRO, VP Sales · Sales · VP");
  });
});

describe("persona briefing page contracts", () => {
  it("reads as a document with edit behind a single action", async () => {
    const { readFileSync } = await import("node:fs");
    const manage = readFileSync(
      "src/app/(app)/setup/[productId]/personas/manage/[personaId]/page.tsx",
      "utf8",
    );
    const form = readFileSync("src/components/PersonaForm.tsx", "utf8");
    const draft = readFileSync("src/components/PersonaDraftReview.tsx", "utf8");
    expect(manage).toContain("PersonaForm");
    expect(form).toContain('editing ? "Done editing" : "Edit"');
    expect(form).toContain("PersonaBriefingDocument");
    expect(form).toContain("ExportPdfButton");
    expect(form).toContain("data-print-document");
    expect(draft).toContain("PersonaBriefingDocument");
    expect(draft).toContain("ExportPdfButton");
    expect(draft).toContain('editing ? "Done editing" : "Edit"');
  });

  it("keeps criteria editor behind edit on draft review", async () => {
    const { readFileSync } = await import("node:fs");
    const draft = readFileSync("src/components/PersonaDraftReview.tsx", "utf8");
    expect(draft).toContain("PersonaCriteriaEditor");
    expect(draft).toMatch(/editing \?[\s\S]*PersonaCriteriaEditor/);
  });
});
