/**
 * Contact upsert into list: email-less always creates; title change records previousTitle.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("contact upsert into list", { timeout: 60_000 }, () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  let orgId = "";
  let listId = "";
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT "contactListId" FROM "ContactListMembership" LIMIT 0`;
      await prisma.$queryRaw`SELECT "previousTitle" FROM "Contact" LIMIT 0`;
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Upsert ${suffix}`,
          slug: `test-upsert-${suffix}`,
          status: "ACTIVE",
        },
      });
      orgId = org.id;
      const list = await prisma.contactList.create({
        data: {
          organizationId: orgId,
          name: `Upsert list ${suffix}`,
          sourceType: "PASTE",
          totalContacts: 0,
        },
      });
      listId = list.id;
      ready = true;
    } catch (e) {
      console.warn("Skipping contact upsert DB tests — run db:test:migrate:", e);
    }
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    if (prisma) await prisma.$disconnect();
  });

  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      organizationId: orgId,
      contactListId: listId,
      firstName: "Ada",
      lastName: "Lovelace",
      email: null as string | null,
      title: null as string | null,
      company: null as string | null,
      companyWebsite: null as string | null,
      industry: null as string | null,
      employeeCount: null as number | null,
      revenue: null as number | null,
      location: null as string | null,
      linkedinUrl: null as string | null,
      phone: null as string | null,
      rawData: {},
      ...overrides,
    };
  }

  it("email-less imports always create new contacts (no dedupe)", async () => {
    if (!ready) return;
    const { upsertContactIntoList } = await import("@/lib/contact/upsert");

    const first = await prisma.$transaction((tx) =>
      upsertContactIntoList(
        tx,
        baseInput({ firstName: "NoEmail", lastName: "One", title: "Analyst" }),
      ),
    );
    const second = await prisma.$transaction((tx) =>
      upsertContactIntoList(
        tx,
        baseInput({ firstName: "NoEmail", lastName: "Two", title: "Analyst" }),
      ),
    );

    expect(first.created).toBe(true);
    expect(first.emailMissing).toBe(true);
    expect(first.merged).toBe(false);
    expect(second.created).toBe(true);
    expect(second.emailMissing).toBe(true);
    expect(second.contact.id).not.toBe(first.contact.id);

    const count = await prisma.contact.count({
      where: {
        organizationId: orgId,
        email: null,
        memberships: { some: { contactListId: listId } },
      },
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("incoming title change sets previousTitle and titleChangedAt", async () => {
    if (!ready) return;
    const { upsertContactIntoList } = await import("@/lib/contact/upsert");
    const email = `title-change-${suffix}@example.test`;

    const created = await prisma.$transaction((tx) =>
      upsertContactIntoList(
        tx,
        baseInput({
          email,
          firstName: "Title",
          lastName: "Changer",
          title: "Manager",
        }),
      ),
    );
    expect(created.created).toBe(true);
    expect(created.titleChanged).toBe(false);

    const updated = await prisma.$transaction((tx) =>
      upsertContactIntoList(
        tx,
        baseInput({
          email,
          firstName: "Title",
          lastName: "Changer",
          title: "Director",
        }),
      ),
    );
    expect(updated.created).toBe(false);
    expect(updated.merged).toBe(true);
    expect(updated.titleChanged).toBe(true);
    expect(updated.contact.title).toBe("Director");
    expect(updated.contact.previousTitle).toBe("Manager");
    expect(updated.contact.titleChangedAt).not.toBeNull();
  });
});
