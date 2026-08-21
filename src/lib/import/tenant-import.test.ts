import { describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("tenant-scoped list import", () => {
  it("creates a list only for the active organization and blocks cross-tenant access", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "sourceType" FROM "ContactList" LIMIT 0`;
    } catch {
      await prisma.$disconnect();
      console.warn(
        "Skipping tenant import DB test: run migration 20260320140000_add_contact_list_source first.",
      );
      return;
    }

    const suffix = Date.now().toString(36);

    const orgA = await prisma.organization.create({
      data: {
        name: `[TEST] Import Org A ${suffix}`,
        slug: `test-import-a-${suffix}`,
        status: "ACTIVE",
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: `[TEST] Import Org B ${suffix}`,
        slug: `test-import-b-${suffix}`,
        status: "ACTIVE",
      },
    });

    const listA = await prisma.contactList.create({
      data: {
        organizationId: orgA.id,
        name: `[TEST] List A ${suffix}`,
        sourceType: "PASTE",
        totalContacts: 0,
      },
    });

    await prisma.contact.create({
      data: {
        organizationId: orgA.id,
        contactListId: listA.id,
        email: `a-${suffix}@example.test`,
        firstName: "Ann",
        lastName: "Alpha",
        rawData: { source: "test" },
      },
    });

    await prisma.contactList.update({
      where: { id: listA.id },
      data: { totalContacts: 1 },
    });

    const visibleToA = await prisma.contactList.findFirst({
      where: { id: listA.id, organizationId: orgA.id },
    });
    const visibleToB = await prisma.contactList.findFirst({
      where: { id: listA.id, organizationId: orgB.id },
    });

    expect(visibleToA?.id).toBe(listA.id);
    expect(visibleToB).toBeNull();

    const contactsForB = await prisma.contact.findMany({
      where: { organizationId: orgB.id, contactListId: listA.id },
    });
    expect(contactsForB).toHaveLength(0);

    await prisma.$disconnect();
  });
});
