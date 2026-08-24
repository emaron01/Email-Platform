import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildCampaignStages,
  resolveCampaignStage,
} from "@/lib/workflow/campaign-stages";
import {
  firstUnresolvedCriterion,
  QUALIFICATION_BUCKET_LABELS,
  QUALIFICATION_BUCKETS,
} from "@/lib/workflow/qualification";

const prismaMock = vi.hoisted(() => ({
  product: { findMany: vi.fn() },
  campaign: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getHomeWorkflow } from "@/lib/workflow/home";

function productFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "product_1",
    name: "Forecast",
    approvalStatus: "APPROVED",
    icps: [
      {
        id: "icp_1",
        name: "Primary target",
        lastInterpretedAt: new Date(),
        criteria: [
          {
            evidenceClass: "TARGETED_SEARCH",
            targetedSearchDecision: null,
          },
        ],
      },
    ],
    personas: [{ id: "persona_1", name: "Revenue leader" }],
    setupRuns: [
      {
        suggestedPersonasJson: [
          { suggestionKey: "rev", name: "Revenue leader" },
        ],
      },
    ],
    ...overrides,
  };
}

describe("home workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.campaign.findMany.mockResolvedValue([]);
  });

  it.each([
    ["Product", []],
    ["ICP", [productFixture({ icps: [] })]],
    ["Persona", [productFixture({ personas: [] })]],
  ])(
    "renders pre-setup state when %s is missing",
    async (_missing, products) => {
      prismaMock.product.findMany.mockResolvedValue(products);
      const result = await getHomeWorkflow("org_1");
      expect(result.setupComplete).toBe(false);
    },
  );

  it("enables campaigns only when approved Product, interpreted ICP criteria, and Persona coexist", async () => {
    prismaMock.product.findMany.mockResolvedValue([productFixture()]);
    const result = await getHomeWorkflow("org_1");
    expect(result.setupComplete).toBe(true);
    expect(result.product.label).toBe("Approved");
    expect(result.icp.criterionCount).toBe(1);
    expect(result.icp.needsLookupCount).toBe(1);
    expect(result.personas.names).toEqual(["Revenue leader"]);
  });
});

describe("campaign stage rail", () => {
  it("marks completed stages, permits backward stages, and explains a blocked Emails stage", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 2,
      survivingCompanyCount: 1,
      qualifiedContactCount: 0,
      generatedEmailCount: 0,
      sentEmailCount: 0,
    });
    expect(stages.find((stage) => stage.key === "setup")?.completed).toBe(true);
    expect(stages.find((stage) => stage.key === "companies")?.available).toBe(
      true,
    );
    expect(stages.find((stage) => stage.key === "contacts")?.available).toBe(
      true,
    );
    expect(stages.find((stage) => stage.key === "emails")).toMatchObject({
      available: false,
      unavailableReason: "At least one qualified contact is required.",
    });
    expect(resolveCampaignStage("companies", stages)).toBe("companies");
    expect(resolveCampaignStage("emails", stages)).toBe("contacts");
  });

  it("blocks Contacts when company results have no surviving Good company", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 3,
      survivingCompanyCount: 0,
      qualifiedContactCount: 0,
      generatedEmailCount: 0,
      sentEmailCount: 0,
    });
    expect(stages.find((stage) => stage.key === "contacts")).toMatchObject({
      available: false,
      unavailableReason:
        "At least one company must be in Good before reviewing contacts.",
    });
  });
});

describe("qualification bucket contract", () => {
  it("uses identical Good / Needs review / Excluded ordering", () => {
    expect(
      QUALIFICATION_BUCKETS.map((key) => QUALIFICATION_BUCKET_LABELS[key]),
    ).toEqual(["Good", "Needs review", "Excluded"]);
  });

  it("surfaces an unresolved criterion for a research action", () => {
    expect(
      firstUnresolvedCriterion([
        {
          criterionId: "criterion_1",
          name: "Forecast ownership",
          assessment: "NEUTRAL",
          evidenceOutcome: "UNVERIFIABLE",
          reasoning: "Can't confirm forecast ownership vs CRM administration.",
        },
      ]),
    ).toEqual({
      criterionId: "criterion_1",
      name: "Forecast ownership",
      reasoning: "Can't confirm forecast ownership vs CRM administration.",
    });
  });
});

describe("workflow view contracts", () => {
  it("keeps every campaign stage on the workspace and supplies actionable empty states", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    for (const stage of [
      "setup",
      "list",
      "companies",
      "contacts",
      "emails",
      "send",
      "report",
    ]) {
      expect(page).toContain(`"${stage}"`);
    }
    expect(page).toContain("No company qualification results yet");
    expect(page).toContain("No contact qualification results yet");
    expect(page).toContain("No qualified contacts are ready for this stage");
    expect(page).toContain("No campaign activity has been recorded yet");
  });

  it("redirects stage deep links into the persistent campaign workspace", () => {
    const redirectPage = readFileSync(
      "src/app/(app)/campaigns/[id]/[stage]/page.tsx",
      "utf8",
    );
    expect(redirectPage).toContain(
      "redirect(`/campaigns/${id}?stage=${stage}`)",
    );
  });

  it("does not render unsupported engagement metrics", () => {
    const roots = ["src/app", "src/components"];
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.name.endsWith(".tsx")) files.push(path);
      }
    };
    roots.forEach(visit);
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\b(?:reply count|open rate|click rate)\b/i);
  });
});
