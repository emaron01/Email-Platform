import { beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("research runs", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  let orgId = "";
  let userId = "";
  let listId = "";
  let suffix = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "id" FROM "ResearchRun" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping research run DB tests: apply research_run migration first.",
      );
      return;
    }

    ready = true;
    suffix = Date.now().toString(36);

    const org = await prisma.organization.create({
      data: {
        name: `[TEST] Research Run Org ${suffix}`,
        slug: `test-research-run-${suffix}`,
        status: "ACTIVE",
      },
    });
    orgId = org.id;

    const user = await prisma.user.create({
      data: {
        email: `research-run-${suffix}@example.com`,
        emailNormalized: `research-run-${suffix}@example.com`,
      },
    });
    userId = user.id;

    const list = await prisma.contactList.create({
      data: {
        organizationId: orgId,
        name: `List ${suffix}`,
        sourceType: "PASTE",
        createdByUserId: userId,
      },
    });
    listId = list.id;
  });

  it("rejects a second active run for the same list", async () => {
    if (!ready) return;

    const { createResearchRun } = await import("@/lib/research/runs");

    await prisma.researchRun.create({
      data: {
        organizationId: orgId,
        contactListId: listId,
        initiatedByUserId: userId,
        status: "PENDING",
        totalCompanies: 1,
      },
    });

    const second = await createResearchRun({
      organizationId: orgId,
      contactListId: listId,
      initiatedByUserId: userId,
      forceRefresh: true,
    });
    expect(second.ok).toBe(false);
    if (!second.ok && second.code === "ACTIVE_RUN") {
      expect(second.activeRunId).toBeTruthy();
    } else {
      expect.fail("expected ACTIVE_RUN");
    }

    await prisma.researchRun.updateMany({
      where: { contactListId: listId },
      data: { status: "CANCELLED" },
    });
  });
});
