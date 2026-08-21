import { beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("scoring engine tenant isolation (Phase 3C)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  let orgAId = "";
  let orgBId = "";
  let runAId = "";
  let scoreAId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "scoringStatus" FROM "ContactScore" LIMIT 0`;
      await prisma.$queryRaw`SELECT "aiModel" FROM "ContactScore" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping Phase 3C scoring DB tests: apply migration 20260320220000_scoring_engine first.",
      );
      return;
    }

    ready = true;
    const suffix = Date.now().toString(36);

    const orgA = await prisma.organization.create({
      data: {
        name: `[TEST] ScoreEngine A ${suffix}`,
        slug: `test-score-engine-a-${suffix}`,
        status: "ACTIVE",
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: `[TEST] ScoreEngine B ${suffix}`,
        slug: `test-score-engine-b-${suffix}`,
        status: "ACTIVE",
      },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const product = await prisma.product.create({
      data: { organizationId: orgAId, name: `[TEST] SE Product ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: product.id,
        name: `[TEST] SE ICP ${suffix}`,
        targetIndustries: ["SaaS"],
        negativeSignals: ["Uses competitor X exclusively"],
      },
    });
    const persona = await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: product.id,
        name: `[TEST] SE Persona ${suffix}`,
        targetTitles: ["VP Sales"],
      },
    });
    const list = await prisma.contactList.create({
      data: {
        organizationId: orgAId,
        name: `[TEST] SE List ${suffix}`,
        sourceType: "PASTE",
        totalContacts: 1,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId: orgAId,
        contactListId: list.id,
        firstName: "Sam",
        lastName: "Seller",
        title: "VP Sales",
        company: "Acme",
        email: `sam-${suffix}@example.test`,
      },
    });

    const productSnapshot = {
      id: product.id,
      name: product.name,
      description: "Outbound platform",
      valueProposition: "Book more meetings",
      averageOrderValue: null,
      websiteUrl: null,
    };
    const icpSnapshot = {
      id: icp.id,
      name: icp.name,
      description: null,
      targetIndustries: ["SaaS"],
      minEmployees: null,
      maxEmployees: null,
      minRevenue: null,
      maxRevenue: null,
      targetGeographies: null,
      requiredTechnologies: null,
      positiveSignals: null,
      negativeSignals: ["Uses competitor X exclusively"],
      notes: null,
    };
    const personaSnapshot = {
      id: persona.id,
      name: persona.name,
      targetTitles: ["VP Sales"],
      department: null,
      seniority: null,
      responsibilities: null,
      painPoints: null,
      desiredOutcomes: null,
      messagingNotes: null,
    };

    const run = await prisma.scoringRun.create({
      data: {
        organizationId: orgAId,
        contactListId: list.id,
        productId: product.id,
        icpId: icp.id,
        personaId: persona.id,
        status: "PENDING",
        totalContacts: 1,
        scoredContacts: 0,
        productSnapshot,
        icpSnapshot,
        personaSnapshot,
      },
    });
    runAId = run.id;

    const score = await prisma.contactScore.create({
      data: {
        organizationId: orgAId,
        contactId: contact.id,
        scoringRunId: run.id,
        scoringStatus: "PENDING",
        researchStatus: "NOT_STARTED",
      },
    });
    scoreAId = score.id;
  });

  it("blocks cross-tenant scoring run access", async () => {
    if (!ready) return;
    process.env.DEV_ORGANIZATION_ID = orgBId;
    const { getScoringReadiness } = await import("@/lib/scoring/engine");
    const { TenantError } = await import("@/lib/tenant/getCurrentOrganization");

    await expect(getScoringReadiness(runAId)).rejects.toBeInstanceOf(
      TenantError,
    );
  });

  it("persists ContactScore provenance fields without API key", async () => {
    if (!ready) return;

    await prisma.contactScore.update({
      where: { id: scoreAId },
      data: {
        scoringStatus: "COMPLETED",
        overallScore: 82,
        icpScore: 90,
        personaScore: 80,
        companyScore: 70,
        productRelevanceScore: 75,
        scoreLabel: "GOOD",
        recommendedAction: "Good target — include in campaign.",
        reasoning: "Title and industry align.",
        assessmentData: {
          dimensions: [
            {
              dimension: "Industry Fit",
              component: "ICP",
              assessment: "STRONG",
              evidence: ["SaaS"],
              concerns: [],
              confidence: "HIGH",
            },
          ],
          unknownDimensionCount: 0,
        },
        aiProvider: "openai-compatible",
        aiModel: "env-model-name",
        aiModelUrlIdentifier: "https://example.test/v1/chat/completions",
        promptVersion: "1",
        scoringLogicVersion: "1",
        scoredAt: new Date(),
      },
    });

    const saved = await prisma.contactScore.findUnique({
      where: { id: scoreAId },
    });
    expect(saved?.aiProvider).toBe("openai-compatible");
    expect(saved?.aiModel).toBe("env-model-name");
    expect(saved?.promptVersion).toBe("1");
    expect(saved?.scoringLogicVersion).toBe("1");
    expect(JSON.stringify(saved)).not.toMatch(/AI_API_KEY|sk-/i);
  });

  it("keeps historical scoring snapshots intact on the run", async () => {
    if (!ready) return;
    const run = await prisma.scoringRun.findUnique({ where: { id: runAId } });
    expect(run?.productSnapshot).toMatchObject({
      valueProposition: "Book more meetings",
    });
    expect(run?.icpSnapshot).toMatchObject({
      targetIndustries: ["SaaS"],
    });
    expect(run?.personaSnapshot).toMatchObject({
      targetTitles: ["VP Sales"],
    });
  });

  it("one failed contact does not prevent others from remaining scoreable", async () => {
    if (!ready) return;
    const suffix = Date.now().toString(36);
    const list = await prisma.contactList.findFirst({
      where: { organizationId: orgAId },
    });
    expect(list).toBeTruthy();

    const contact2 = await prisma.contact.create({
      data: {
        organizationId: orgAId,
        contactListId: list!.id,
        firstName: "Pat",
        lastName: "Prospect",
        title: "Director",
        company: "Beta",
      },
    });

    const failed = await prisma.contactScore.create({
      data: {
        organizationId: orgAId,
        contactId: contact2.id,
        scoringRunId: runAId,
        scoringStatus: "FAILED",
        scoringError: "Simulated provider failure",
        researchStatus: "NOT_STARTED",
      },
    });

    const completed = await prisma.contactScore.findFirst({
      where: {
        id: scoreAId,
        organizationId: orgAId,
        scoringStatus: "COMPLETED",
      },
    });
    expect(completed).toBeTruthy();
    expect(failed.scoringStatus).toBe("FAILED");
  });
});
