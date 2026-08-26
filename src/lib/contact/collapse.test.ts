/**
 * Contact collapse: duplicate org+email rows → one Contact + memberships + audit.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("contact collapse", { timeout: 60_000 }, () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  let orgId = "";
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT "contactListId" FROM "ContactListMembership" LIMIT 0`;
      await prisma.$queryRaw`SELECT "winnerContactId" FROM "ContactMergeAudit" LIMIT 0`;
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Collapse ${suffix}`,
          slug: `test-collapse-${suffix}`,
          status: "ACTIVE",
        },
      });
      orgId = org.id;
      ready = true;
    } catch (e) {
      console.warn("Skipping contact collapse DB tests — run db:test:migrate:", e);
    }
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    if (prisma) await prisma.$disconnect();
  });

  it("preview + apply collapses same-email contacts across lists with durable audit", async () => {
    if (!ready) return;

    const list1 = await prisma.contactList.create({
      data: {
        organizationId: orgId,
        name: `Collapse L1 ${suffix}`,
        sourceType: "PASTE",
        totalContacts: 1,
      },
    });
    const list2 = await prisma.contactList.create({
      data: {
        organizationId: orgId,
        name: `Collapse L2 ${suffix}`,
        sourceType: "UPLOAD",
        totalContacts: 1,
      },
    });

    const sharedEmail = `same-person-${suffix}@example.test`;
    // Pre-normalization duplicates: null normalizedEmail so unique allows both rows.
    const older = await prisma.contact.create({
      data: {
        organizationId: orgId,
        email: sharedEmail,
        normalizedEmail: null,
        firstName: "Winner",
        lastName: "Keep",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        memberships: {
          create: {
            organizationId: orgId,
            contactListId: list1.id,
          },
        },
      },
    });
    const newer = await prisma.contact.create({
      data: {
        organizationId: orgId,
        email: sharedEmail,
        normalizedEmail: null,
        firstName: "Loser",
        lastName: "Merge",
        title: "VP Sales",
        createdAt: new Date("2024-06-01T00:00:00.000Z"),
        memberships: {
          create: {
            organizationId: orgId,
            contactListId: list2.id,
          },
        },
      },
    });

    const {
      previewContactCollapse,
      applyContactCollapse,
    } = await import("@/lib/contact/collapse");

    const preview = await previewContactCollapse(prisma, {
      organizationId: orgId,
    });
    expect(preview.duplicateGroupCount).toBe(1);
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0]?.winnerContactId).toBe(older.id);
    expect(preview.groups[0]?.loserContactIds).toEqual([newer.id]);
    expect(preview.groups[0]?.listIds.sort()).toEqual(
      [list1.id, list2.id].sort(),
    );

    await applyContactCollapse(prisma, { organizationId: orgId });

    const remaining = await prisma.contact.findMany({
      where: { organizationId: orgId, email: sharedEmail },
      include: { memberships: true },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(older.id);
    expect(remaining[0]?.memberships).toHaveLength(2);
    expect(
      remaining[0]?.memberships.map((m) => m.contactListId).sort(),
    ).toEqual([list1.id, list2.id].sort());
    expect(remaining[0]?.title).toBe("VP Sales");

    const audits = await prisma.contactMergeAudit.findMany({
      where: { organizationId: orgId, loserContactId: newer.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.winnerContactId).toBe(older.id);
    expect(audits[0]?.loserContactId).toBe(newer.id);

    expect(
      await prisma.contact.findUnique({ where: { id: newer.id } }),
    ).toBeNull();
    expect(
      await prisma.contactMergeAudit.count({
        where: { organizationId: orgId, loserContactId: newer.id },
      }),
    ).toBe(1);
  });
});
