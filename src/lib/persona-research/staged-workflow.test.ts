/**
 * Staged Product → Persona workflow contracts.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productAiResponseSchema,
} from "@/lib/product-research/contract";
import { transformProductAiResponse } from "@/lib/product-research/transform";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";
import { selectProductEvidenceForPersona } from "@/lib/persona-research/compact";
import {
  PERSONA_SYNTHESIS_PROMPT_VERSION,
  parsePersonaAiResponse,
} from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

describe("Product synthesis v3 — no full Persona drafts", () => {
  it("accepts suggestedBuyerRoles without suggestionKey or persona drafts", () => {
    const ai = productAiResponseSchema.parse({
      productDraft: { description: "Forecast software" },
      productMessagingDraft: { primaryPositioning: "Confidence" },
      suggestedBuyerRoles: [
        {
          name: "Chief Revenue Officer",
          likelyTitles: ["CRO", "VP Sales"],
          whyThisRoleMatters: "Owns forecast accuracy",
          confidence: "HIGH",
        },
      ],
    });
    expect(ai.suggestedBuyerRoles).toHaveLength(1);
    expect(ai).not.toHaveProperty("personas");
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("5");

    const result = transformProductAiResponse(ai);
    expect(result.suggestedBuyerRoles[0]!.suggestionKey).toBeTruthy();
    expect(result).not.toHaveProperty("personaDrafts");
  });

  it("prompt forbids full persona drafts", () => {
    const messages = buildProductSynthesisMessages({
      productName: "X",
      primaryUrl: null,
      excerpts: [
        {
          sourceId: "1",
          sourceType: "USER_NOTE",
          displayName: "n",
          text: "Sales forecast tool",
        },
      ],
    });
    expect(messages[0]!.content).toContain("suggestedBuyerRoles");
    expect(messages[0]!.content).toContain("Do NOT return");
    expect(messages[0]!.content).toContain("personaDrafts");
  });
});

describe("persona synthesis differentiation prompt", () => {
  it("passes existing approved personas for runtime differentiation", () => {
    const messages = buildPersonaSynthesisMessages({
      productName: "Example",
      productSnapshot: { name: "Example" },
      productMessaging: null,
      buyerRole: {
        name: "Role B",
        likelyTitles: ["Director"],
        departmentFunction: "Operations",
        whyThisRoleMatters: "Owns process",
        suggestionKey: "role_b",
        confidence: "HIGH",
        evidenceRefs: [],
      },
      userContext: null,
      productEvidence: [
        {
          sourceId: "product-1",
          sourceType: "URL",
          displayName: "Approved product profile",
          text: "Forecast software that inspects deal evidence before commit.",
        },
      ],
      icpContext: null,
      existingApprovedPersonas: [
        {
          id: "p1",
          name: "Role A",
          painPoints: ["Shared operational delay pain"],
          messagingNotes: ["Emphasize handoff risk"],
        },
      ],
    });
    expect(messages[0]!.content).toContain("Vice President of Sales");
    expect(messages[0]!.content).toContain("seniority level alone");
    expect(messages[0]!.content).toContain("existingApprovedPersonas");
    expect(messages[0]!.content).toContain("daily experience and accountability");
    expect(messages[0]!.content).toContain("manufactured contrast");
    expect(messages[1]!.content).toContain("Role A");
    expect(messages[1]!.content).toContain("Shared operational delay pain");
    expect(messages[1]!.content).toContain("Approved product profile");
    expect(messages[1]!.content).toContain(
      "Forecast software that inspects deal evidence before commit.",
    );
    expect(messages[1]!.content).not.toContain("personaWebEvidence");
    expect(messages[0]!.content).not.toContain("WEB_EVIDENCE");
    expect(messages[1]!.content).not.toContain("WEB_EVIDENCE");
  });

  it("asks a second persona to stay distinct from an approved peer's pains", () => {
    const messages = buildPersonaSynthesisMessages({
      productName: "Mathew Sales Forecaster",
      productSnapshot: {
        name: "Mathew Sales Forecaster",
        description: "Inspects deal evidence before a forecast commit.",
      },
      productMessaging: null,
      buyerRole: {
        name: "Revenue Operations Leader",
        likelyTitles: ["VP Revenue Operations"],
        departmentFunction: "Sales",
        whyThisRoleMatters: "Owns forecast process",
        suggestionKey: "revops",
        confidence: "HIGH",
        evidenceRefs: [],
      },
      userContext: null,
      productEvidence: [],
      icpContext: null,
      existingApprovedPersonas: [
        {
          id: "vp-sales",
          name: "VP of Sales",
          painPoints: ["Weekly forecast calls depend on rep optimism"],
          messagingNotes: ["Lead with commit inspection"],
        },
      ],
    });
    const user = messages[1]!.content;
    expect(user).toContain("Mathew Sales Forecaster");
    expect(user).toContain("Inspects deal evidence before a forecast commit.");
    expect(user).toContain("VP of Sales");
    expect(user).toContain("Weekly forecast calls depend on rep optimism");
    expect(messages[0]!.content).toContain(
      "what distinguishes this role's daily experience and accountability",
    );
    expect(user).not.toContain("personaWebEvidence");
  });
});

describe("persona synthesis from the product profile", () => {
  it("keeps prompt version 10 and does not configure persona web search", () => {
    expect(PERSONA_SYNTHESIS_PROMPT_VERSION).toBe("10");
    expect(DEFAULT_RESEARCH_POLICY_VALUES).not.toHaveProperty(
      "maxSearchQueriesPerPersona",
    );
    expect(DEFAULT_RESEARCH_POLICY_VALUES).not.toHaveProperty(
      "maxSourcesPerPersona",
    );
    expect(DEFAULT_RESEARCH_POLICY_VALUES).not.toHaveProperty(
      "personaResearchFreshnessDays",
    );
    expect(DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerProduct).toBe(12);
  });

  it("parses a complete persona drafted from the product profile alone", () => {
    const { data, coercedFields } = parsePersonaAiResponse({
      personaDraft: {
        name: "VP of Sales",
        likelyTitles: ["VP Sales"],
        departmentFunction: "Sales",
        seniority: "VP",
        roleSummary: "Owns the weekly forecast commit.",
        primaryResponsibilities: ["Inspect deal evidence before commit"],
        ownershipAreas: ["Team forecast"],
        kpisAndAccountabilities: ["Forecast accuracy"],
        painPoints: ["Commits depend on rep optimism"],
        desiredOutcomesFromSolution: ["A commit backed by deal evidence"],
        negativeRoleSignals: [
          {
            text: "Individual-contributor seller",
            exclusionTestability: "TITLE_TESTABLE",
          },
        ],
        confidence: "HIGH",
        evidenceRefs: [
          {
            claim: "Owns the weekly forecast commit.",
            sourceIds: [],
            provenanceClasses: ["CUSTOMER_EVIDENCE", "WEB_EVIDENCE"],
          },
        ],
      },
    });
    const draft = data.personaDraft;
    expect(draft.name).toBe("VP of Sales");
    expect(draft.primaryResponsibilities).toEqual([
      "Inspect deal evidence before commit",
    ]);
    expect(draft.painPoints).toEqual(["Commits depend on rep optimism"]);
    expect(draft.negativeRoleSignals).toHaveLength(1);
    expect(draft.evidenceRefs[0]?.provenanceClasses).toEqual([
      "CUSTOMER_EVIDENCE",
    ]);
    expect(coercedFields.length).toBeGreaterThan(0);
  });

  it("selects role-relevant product evidence without Product re-fetch", () => {
    const selected = selectProductEvidenceForPersona({
      roleName: "CRO",
      excerpts: [
        {
          sourceId: "a",
          sourceType: "URL",
          displayName: "Pricing",
          text: "Pricing plans start at $10.",
        },
        {
          sourceId: "b",
          sourceType: "URL",
          displayName: "Forecast",
          text: "Improve forecast accuracy and sales coaching for CROs.",
        },
      ],
      maxChars: 5000,
    });
    expect(selected.some((e) => e.sourceId === "b")).toBe(true);
  });
});

describe("architecture boundaries", () => {
  it("persona synthesis does not invoke Product acquisition or contact scoring", async () => {
    const fs = await import("node:fs");
    const synth = fs.readFileSync(
      "src/lib/persona-research/synthesize.ts",
      "utf8",
    );
    expect(synth).toContain("getPersonaAiProvider");
    expect(synth).toContain("selectProductEvidenceForPersona");
    expect(synth).toContain("existingApprovedPersonas");
    expect(synth).not.toContain("acquireProductEvidence");
    expect(synth).not.toContain("runProgressiveProductWebSearch");
    expect(synth).not.toContain("runProgressivePersonaWebSearch");
    expect(synth).not.toContain("discoverSourcesViaWebSearch");
    expect(synth).not.toContain("fetchProductPageUrl");
    expect(synth).not.toContain("PERSONA_WEB_SEARCH");
    expect(synth).not.toContain("personaWebEvidence");
    expect(synth).not.toContain("scoreContact");
    expect(synth).not.toContain("researchContact");
    expect(synth).not.toContain("generateEmail");
  });

  it("product synthesize no longer writes personaDrafts", async () => {
    const fs = await import("node:fs");
    const synth = fs.readFileSync(
      "src/lib/product-research/synthesize.ts",
      "utf8",
    );
    expect(synth).toContain("suggestedBuyerRoles");
    expect(synth).toContain("personaDraftsJson: Prisma.DbNull");
  });
});
