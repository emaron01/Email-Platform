/**
 * Criteria architecture tests: ICP/Persona NL preservation, interpreters,
 * contact research triggers, deterministic evaluation, merge protection, snapshots.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("criteria evaluate + merge (unit)", () => {
  it("supports Buildings Owned >= 25 and Sales AOV as dynamic criteria", async () => {
    const { evaluateCriterionDeterministic } = await import(
      "@/lib/criteria/evaluate"
    );
    const buildings = evaluateCriterionDeterministic({
      criterion: {
        name: "Buildings Owned",
        criterionType: "buildings_owned",
        dataType: "NUMBER",
        operator: "GREATER_THAN_OR_EQUAL",
        targetValue: 25,
        importance: "HIGH",
        isRequired: true,
        isDisqualifier: false,
        sortOrder: 0,
      },
      actualValue: 40,
    });
    expect(buildings.method).toBe("DETERMINISTIC");
    expect(buildings.assessment).toBe("STRONG");

    const aov = evaluateCriterionDeterministic({
      criterion: {
        name: "Sales AOV",
        criterionType: "sales_aov",
        dataType: "CURRENCY",
        operator: "GREATER_THAN_OR_EQUAL",
        targetValue: 25000,
        importance: "MEDIUM",
        isRequired: false,
        isDisqualifier: false,
        sortOrder: 1,
      },
      actualValue: 10000,
    });
    expect(aov.assessment).toBe("NO_FIT");
    expect(aov.method).toBe("DETERMINISTIC");
  });

  it("keeps UNKNOWN when evidence missing — does not fabricate NO_FIT", async () => {
    const { evaluateCriterionDeterministic } = await import(
      "@/lib/criteria/evaluate"
    );
    const result = evaluateCriterionDeterministic({
      criterion: {
        name: "Fleet Size",
        criterionType: "fleet_size",
        dataType: "NUMBER",
        operator: "GREATER_THAN_OR_EQUAL",
        targetValue: 100,
        importance: "HIGH",
        isRequired: true,
        isDisqualifier: false,
        sortOrder: 0,
      },
      actualValue: null,
    });
    expect(result.assessment).toBe("UNKNOWN");
    expect(result.method).toBe("UNKNOWN");
  });

  it("does not silently overwrite manual edits on reinterpret", async () => {
    const { planCriterionReinterpretation } = await import(
      "@/lib/criteria/merge"
    );
    const plan = planCriterionReinterpretation({
      existing: [
        {
          id: "manual-1",
          name: "Buildings Owned",
          criterionType: "buildings_owned",
          manuallyEdited: true,
        },
        {
          id: "ai-1",
          name: "Industry",
          criterionType: "industry",
          manuallyEdited: false,
        },
      ],
      aiDrafts: [
        {
          name: "Buildings Owned",
          criterionType: "buildings_owned",
          dataType: "NUMBER",
          operator: "GREATER_THAN_OR_EQUAL",
          targetValue: 50,
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
          sortOrder: 0,
        },
        {
          name: "Geography",
          criterionType: "geography",
          dataType: "TEXT",
          operator: "CONTAINS",
          targetValue: "Northeast",
          importance: "MEDIUM",
          isRequired: false,
          isDisqualifier: false,
          sortOrder: 1,
        },
      ],
    });
    expect(plan.keepIds).toEqual(["manual-1"]);
    expect(plan.insertDrafts.map((d) => d.name)).toEqual(["Geography"]);
    expect(plan.insertDrafts.some((d) => d.name === "Buildings Owned")).toBe(
      false,
    );
  });

  it("legacy backfill includes company revenue as firmographic criterion", async () => {
    const { buildLegacyIcpCriteria } = await import(
      "@/lib/criteria/legacy-backfill"
    );
    const drafts = buildLegacyIcpCriteria({
      id: "x",
      organizationId: "o",
      productId: "p",
      name: "ICP",
      description: null,
      definition: null,
      additionalContext: null,
      targetIndustries: ["SaaS"],
      minEmployees: 50,
      maxEmployees: 500,
      minRevenue: { toString: () => "5000000" } as never,
      maxRevenue: { toString: () => "50000000" } as never,
      targetGeographies: ["United States"],
      requiredTechnologies: null,
      positiveSignals: null,
      negativeSignals: null,
      notes: null,
      interpretationVersion: 1,
      interpretationPromptVersion: null,
      lastInterpretedAt: null,
        archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    expect(drafts.some((d) => d.name === "Company Revenue")).toBe(true);
    expect(drafts.some((d) => d.criterionType === "employee_count")).toBe(true);
  });
});

describe("contact research trigger (unit)", () => {
  it("unambiguous titles avoid unnecessary research", async () => {
    const { shouldResearchContactRole } = await import(
      "@/lib/contact-research/trigger"
    );
    const ceo = shouldResearchContactRole({
      title: "CEO",
      personaCriteria: [],
    });
    expect(ceo.needed).toBe(false);

    const cro = shouldResearchContactRole({
      title: "Chief Revenue Officer",
      personaCriteria: [],
    });
    expect(cro.needed).toBe(false);
  });

  it("ambiguous titles like VP Infrastructure trigger research", async () => {
    const { shouldResearchContactRole } = await import(
      "@/lib/contact-research/trigger"
    );
    const result = shouldResearchContactRole({
      title: "VP Infrastructure",
      personaCriteria: [
        {
          name: "Cloud Migration Responsibility",
          criterionType: "responsibility",
          dataType: "TEXT",
          operator: "CONTAINS",
          targetValue: "cloud",
          importance: "CRITICAL",
          isRequired: true,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
    });
    expect(result.needed).toBe(true);
  });

  it("same title can produce different persona fit from role evidence", async () => {
    const { evaluateCriterionDeterministic } = await import(
      "@/lib/criteria/evaluate"
    );
    const itEvidence = evaluateCriterionDeterministic({
      criterion: {
        name: "IT Infrastructure Ownership",
        criterionType: "responsibility",
        dataType: "TEXT",
        operator: "CONTAINS",
        targetValue: "cloud infrastructure",
        importance: "CRITICAL",
        isRequired: true,
        isDisqualifier: false,
        sortOrder: 0,
      },
      actualValue: "Owns cloud infrastructure and data center migration",
    });
    const facilitiesEvidence = evaluateCriterionDeterministic({
      criterion: {
        name: "IT Infrastructure Ownership",
        criterionType: "responsibility",
        dataType: "TEXT",
        operator: "CONTAINS",
        targetValue: "cloud infrastructure",
        importance: "CRITICAL",
        isRequired: true,
        isDisqualifier: false,
        sortOrder: 0,
      },
      actualValue: "Owns facilities and corporate real estate infrastructure",
    });
    expect(itEvidence.assessment).toBe("STRONG");
    expect(facilitiesEvidence.assessment).not.toBe("STRONG");
  });
});

describe("scoring snapshots include criteria", () => {
  it("snapshotIcp preserves definition and criteria arrays", async () => {
    const { snapshotIcp } = await import("@/lib/scoring/snapshots");
    const snap = snapshotIcp(
      {
        id: "icp1",
        organizationId: "o",
        productId: "p",
        name: "ICP",
        description: "desc",
        definition: "NL definition preserved",
        additionalContext: null,
        targetIndustries: ["SaaS"],
        minEmployees: 10,
        maxEmployees: 100,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        interpretationVersion: 2,
        interpretationPromptVersion: "1",
        lastInterpretedAt: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
      [
        {
          name: "Buildings Owned",
          criterionType: "buildings_owned",
          dataType: "NUMBER",
          operator: "GREATER_THAN_OR_EQUAL",
          targetValue: 25,
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
    );
    expect(snap.definition).toBe("NL definition preserved");
    expect(snap.criteria).toHaveLength(1);
    expect(snap.criteria[0]!.name).toBe("Buildings Owned");
  });

  it("getApplicableDimensions uses dynamic criteria when present", async () => {
    const { getApplicableDimensions } = await import(
      "@/lib/scoring/dimensions"
    );
    const dims = getApplicableDimensions({
      icp: {
        id: "i",
        name: "ICP",
        description: null,
        definition: "x",
        targetIndustries: null,
        minEmployees: null,
        maxEmployees: null,
        minRevenue: null,
        maxRevenue: null,
        targetGeographies: null,
        requiredTechnologies: null,
        positiveSignals: null,
        negativeSignals: null,
        notes: null,
        criteria: [
          {
            name: "Buildings Owned",
            criterionType: "buildings_owned",
            dataType: "NUMBER",
            operator: "GREATER_THAN_OR_EQUAL",
            targetValue: 25,
            importance: "HIGH",
            isRequired: true,
            isDisqualifier: false,
            sortOrder: 0,
          },
        ],
      },
      persona: {
        id: "p",
        name: "Persona",
        definition: "IT infra leader",
        targetTitles: null,
        department: null,
        seniority: null,
        responsibilities: null,
        painPoints: null,
        desiredOutcomes: null,
        messagingNotes: null,
        criteria: [
          {
            name: "Cloud Ownership",
            criterionType: "responsibility",
            dataType: "TEXT",
            operator: "CONTAINS",
            targetValue: "cloud",
            importance: "CRITICAL",
            isRequired: true,
            isDisqualifier: false,
            sortOrder: 0,
          },
        ],
      },
      product: {
        id: "pr",
        name: "Prod",
        description: "d",
        valueProposition: "v",
        averageOrderValue: null,
        websiteUrl: null,
      },
    });
    expect(dims.some((d) => d.dimension === "Buildings Owned")).toBe(true);
    expect(dims.some((d) => d.dimension === "Role / Responsibility Match")).toBe(
      true,
    );
    expect(dims.some((d) => d.dimension === "Title Match")).toBe(true);
  });
});

describe.skipIf(!hasDatabase)(
  "criteria DB integration",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "definition" FROM "Icp" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "IcpCriterion" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "ContactResearch" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping criteria DB tests: apply migration 20260321000000 (npm run db:deploy).",
        );
        return;
      }
      ready = true;
    });

    afterEach(async () => {
      // leave test data; unique emails avoid collisions
    });

    it("preserves natural-language ICP definition and backfills criteria", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const ws = await createIndividualWorkspace({
        email: `crit-icp-${suffix}@example.test`,
        name: "Crit",
      });
      const product = await prisma.product.create({
        data: {
          organizationId: ws.organization.id,
          name: `Product ${suffix}`,
        },
      });
      const definition =
        "Commercial real-estate companies with $50M+ revenue owning 25+ buildings.";
      const icp = await prisma.icp.create({
        data: {
          organizationId: ws.organization.id,
          productId: product.id,
          name: `ICP ${suffix}`,
          definition,
          minRevenue: 50_000_000,
          targetIndustries: ["Commercial Real Estate"],
        },
      });
      expect(icp.definition).toBe(definition);

      const { ensureIcpLegacyCriteriaBackfilled } = await import(
        "@/lib/criteria/legacy-backfill"
      );
      await ensureIcpLegacyCriteriaBackfilled(ws.organization.id, icp.id);
      const criteria = await prisma.icpCriterion.findMany({
        where: { organizationId: ws.organization.id, icpId: icp.id },
      });
      expect(criteria.some((c) => c.name === "Company Revenue")).toBe(true);
      const industry = criteria.find((c) => c.name === "Industry");
      const revenue = criteria.find((c) => c.name === "Company Revenue");
      expect(industry?.evidenceClass).toBe("LIST_DATA");
      expect(revenue?.evidenceClass).toBe("LIST_DATA");

      // Re-save definition unchanged
      await prisma.icp.update({
        where: { id: icp.id },
        data: { name: `ICP ${suffix} renamed` },
      });
      const after = await prisma.icp.findUniqueOrThrow({ where: { id: icp.id } });
      expect(after.definition).toBe(definition);
    });

    it("repairs unlocked TARGETED_SEARCH firmographics when listing criteria", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const ws = await createIndividualWorkspace({
        email: `crit-repair-${suffix}@example.test`,
        name: "Repair",
      });
      const product = await prisma.product.create({
        data: {
          organizationId: ws.organization.id,
          name: `Repair Product ${suffix}`,
        },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: ws.organization.id,
          productId: product.id,
          name: `Repair ICP ${suffix}`,
          definition: "SaaS companies in the United States.",
        },
      });
      await prisma.icpCriterion.create({
        data: {
          organizationId: ws.organization.id,
          icpId: icp.id,
          name: "Industry",
          criterionType: "industry",
          dataType: "MULTI_SELECT",
          operator: "IN",
          importance: "HIGH",
          evidenceClass: "TARGETED_SEARCH",
          tier: "PRIMARY",
          sortOrder: 0,
        },
      });

      const { listIcpCriteria } = await import("@/lib/interpretation/icp");
      const listed = await listIcpCriteria(ws.organization.id, icp.id);
      expect(listed.find((c) => c.name === "Industry")?.evidenceClass).toBe(
        "LIST_DATA",
      );
      const stored = await prisma.icpCriterion.findFirstOrThrow({
        where: { id: listed[0]!.id },
      });
      expect(stored.evidenceClass).toBe("LIST_DATA");
      expect(stored.manuallyEdited).toBe(false);
    });

    it("ContactResearch is tenant-scoped; cross-tenant blocked", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const a = await createIndividualWorkspace({
        email: `crit-a-${suffix}@example.test`,
        name: "A",
      });
      const b = await createIndividualWorkspace({
        email: `crit-b-${suffix}@example.test`,
        name: "B",
      });
      const list = await prisma.contactList.create({
        data: {
          organizationId: a.organization.id,
          name: `List ${suffix}`,
        },
      });
      const contact = await prisma.contact.create({
        data: {
          organizationId: a.organization.id,
          contactListId: list.id,
          title: "VP Infrastructure",
          firstName: "Pat",
        },
      });
      await prisma.contactResearch.create({
        data: {
          organizationId: a.organization.id,
          contactId: contact.id,
          status: "COMPLETED",
          roleSummary: "Owns IT infrastructure",
          confidence: "HIGH",
          researchedAt: new Date(),
          researchSources: [{ title: "LinkedIn", url: "https://example.test" }],
        },
      });

      const { getContactResearch } = await import(
        "@/lib/contact-research/service"
      );
      const ok = await getContactResearch(a.organization.id, contact.id);
      expect(ok?.roleSummary).toContain("IT");
      const blocked = await getContactResearch(b.organization.id, contact.id);
      expect(blocked).toBeNull();
    });

    it("scoring run snapshots criteria; later ICP edits do not change snapshot", async () => {
      if (!ready) return;
      // Use tenant data helpers under bypass if available
      process.env.ALLOW_DEV_TENANT_BYPASS = "true";
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const ws = await createIndividualWorkspace({
        email: `crit-score-${suffix}@example.test`,
        name: "Score",
      });
      process.env.DEV_ORGANIZATION_ID = ws.organization.id;
      process.env.DEV_USER_ID = ws.user.id;

      const product = await prisma.product.create({
        data: {
          organizationId: ws.organization.id,
          name: `Score Product ${suffix}`,
          description: "desc",
          valueProposition: "value",
        },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: ws.organization.id,
          productId: product.id,
          name: `Score ICP ${suffix}`,
          definition: "Original definition",
          targetIndustries: ["SaaS"],
          minEmployees: 50,
          maxEmployees: 500,
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: ws.organization.id,
          productId: product.id,
          name: `Score Persona ${suffix}`,
          definition: "IT infrastructure leader",
          targetTitles: ["VP Infrastructure"],
          responsibilities: "Cloud and data centers",
        },
      });
      const list = await prisma.contactList.create({
        data: {
          organizationId: ws.organization.id,
          name: `Score List ${suffix}`,
          totalContacts: 1,
        },
      });
      await prisma.contact.create({
        data: {
          organizationId: ws.organization.id,
          contactListId: list.id,
          title: "CEO",
          firstName: "Alex",
        },
      });

      const { createScoringRun } = await import("@/lib/tenant/data");
      const run = await createScoringRun({
        contactListId: list.id,
        productId: product.id,
        icpId: icp.id,
        personaId: persona.id,
      });

      const snap = run.icpSnapshot as { definition?: string; criteria?: unknown[] };
      expect(snap.definition).toBe("Original definition");
      expect(Array.isArray(snap.criteria)).toBe(true);

      await prisma.icp.update({
        where: { id: icp.id },
        data: { definition: "CHANGED AFTER RUN" },
      });
      const runAfter = await prisma.scoringRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      const snapAfter = runAfter.icpSnapshot as { definition?: string };
      expect(snapAfter.definition).toBe("Original definition");
    });
  },
);
