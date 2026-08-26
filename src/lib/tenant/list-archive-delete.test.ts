/**
 * List archive/delete: FK inventory, block vs archive, no cascade through
 * campaign contacts that are still referenced.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantError } from "@/lib/tenant/errors";
import {
  decideListDelete,
  listArchiveConfirmBody,
  listDeleteConfirmBody,
} from "@/lib/tenant/list-delete";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("list archive/delete contracts", () => {
  it("schema ContactList FKs match the inventory in list-delete.ts", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const list = schema.match(/model ContactList \{[\s\S]*?\n\}/)?.[0] ?? "";
    const contact = schema.match(/model Contact \{[\s\S]*?\n\}/)?.[0] ?? "";
    const scoringRun = schema.match(/model ScoringRun \{[\s\S]*?\n\}/)?.[0] ?? "";
    const campaignContact =
      schema.match(/model CampaignContact \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(list).toContain("contacts");
    expect(list).toContain("scoringRuns");
    expect(list).toContain("archivedAt");
    expect(contact).toMatch(/contactListId\s+String/);
    expect(contact).toMatch(/onDelete: Cascade/);
    expect(scoringRun).toMatch(/contactListId\s+String/);
    expect(scoringRun).toMatch(/onDelete: Cascade/);
    expect(campaignContact).toMatch(/contactId\s+String/);
    expect(campaignContact).toMatch(/onDelete: Cascade/);
    const src = readFileSync("src/lib/tenant/list-delete.ts", "utf8");
    expect(src).toContain("Contact.contactListId");
    expect(src).toContain("ScoringRun.contactListId");
    expect(src).toContain("CampaignContact.contactId");
    expect(src).toContain("EmailDraft.campaignContactId");
    expect(src).toContain("EmailSendRecord.campaignContactId");
    expect(src).toContain("ContactScore");
    expect(src).toContain("ContactResearch");
    expect(src).toContain("TitleSuggestion");
    expect(src).toContain("QualificationBucketOverride");
  });

  it("delete confirmation names contacts, scoring runs, and campaigns", () => {
    const body = listDeleteConfirmBody({
      mode: "delete",
      impact: {
        contactCount: 4,
        scoringRunCount: 2,
        campaignCount: 1,
        activeCampaignCount: 0,
        draftCount: 0,
        sentCount: 0,
      },
      message: "",
    });
    expect(body).toContain("4 contact(s)");
    expect(body).toContain("2 scoring run(s)");
    expect(body).toContain("1 campaign(s) affected");
    expect(listArchiveConfirmBody()).toMatch(/reversible/i);
  });

  it("block vs archive vs delete decisions follow Product/Persona rules", () => {
    expect(
      decideListDelete({
        contactCount: 3,
        scoringRunCount: 0,
        campaignCount: 1,
        activeCampaignCount: 1,
        draftCount: 0,
        sentCount: 0,
      }).mode,
    ).toBe("blocked");
    expect(
      decideListDelete({
        contactCount: 3,
        scoringRunCount: 2,
        campaignCount: 0,
        activeCampaignCount: 0,
        draftCount: 0,
        sentCount: 0,
      }).mode,
    ).toBe("archive");
    expect(
      decideListDelete({
        contactCount: 2,
        scoringRunCount: 0,
        campaignCount: 0,
        activeCampaignCount: 0,
        draftCount: 0,
        sentCount: 0,
      }).mode,
    ).toBe("delete");
  });
});

describe.skipIf(!hasDatabase)(
  "List archive and delete lifecycle",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let orgA = "";
    const suffix = Date.now().toString(36);
    const previousBypass = process.env.ALLOW_DEV_TENANT_BYPASS;
    const previousOrg = process.env.DEV_ORGANIZATION_ID;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "archivedAt" FROM "ContactList" LIMIT 0`;
        const org = await prisma.organization.create({
          data: {
            name: `[TEST] ListArch ${suffix}`,
            slug: `test-list-arch-${suffix}`,
          },
        });
        orgA = org.id;
        process.env.ALLOW_DEV_TENANT_BYPASS = "true";
        process.env.DEV_ORGANIZATION_ID = orgA;
        ready = true;
      } catch (e) {
        console.warn("Skipping list archive DB tests — run db:test:migrate:", e);
      }
    });

    afterAll(async () => {
      if (previousBypass == null) delete process.env.ALLOW_DEV_TENANT_BYPASS;
      else process.env.ALLOW_DEV_TENANT_BYPASS = previousBypass;
      if (previousOrg == null) delete process.env.DEV_ORGANIZATION_ID;
      else process.env.DEV_ORGANIZATION_ID = previousOrg;
      if (orgA) {
        await prisma.organization.delete({ where: { id: orgA } }).catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    async function seedProduct() {
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `Product ${suffix}-${Math.random()}` },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `ICP ${suffix}`,
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Persona ${suffix}`,
        },
      });
      return { product, icp, persona };
    }

    it("archived list is hidden from campaign stage 5 and scoring", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const list = await prisma.contactList.create({
        data: { organizationId: orgA, name: `Archived list ${suffix}` },
      });
      const contact = await prisma.contact.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          firstName: "Hidden",
          lastName: "Row",
          email: `hidden-${suffix}@example.test`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgA,
          name: `Stage5 ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        },
      });
      const scoringRun = await prisma.scoringRun.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          status: "COMPLETED",
          totalContacts: 1,
          scoredContacts: 1,
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: {},
        },
      });
      await prisma.contactScore.create({
        data: {
          organizationId: orgA,
          contactId: contact.id,
          scoringRunId: scoringRun.id,
          scoringStatus: "COMPLETED",
          overallScore: 80,
        },
      });
      const { searchAvailableCampaignContacts, listCompatibleScoringRuns } =
        await import("@/lib/campaign/contacts");
      expect(
        (await searchAvailableCampaignContacts(campaign.id)).some(
          (row) => row.id === contact.id,
        ),
      ).toBe(true);
      expect(
        (await listCompatibleScoringRuns(campaign.id)).some(
          (run) => run.contactList.name === list.name,
        ),
      ).toBe(true);

      const { archiveContactList } = await import("@/lib/tenant/list-delete");
      await archiveContactList(list.id);

      const { listContactLists } = await import("@/lib/tenant/data");
      expect(
        (await listContactLists()).some((row) => row.id === list.id),
      ).toBe(false);
      expect(
        (await listContactLists({ includeArchived: true })).some(
          (row) => row.id === list.id,
        ),
      ).toBe(true);

      expect(
        (await searchAvailableCampaignContacts(campaign.id)).some(
          (row) => row.id === contact.id,
        ),
      ).toBe(false);
      expect(await listCompatibleScoringRuns(campaign.id)).toEqual([]);

      const { createScoringRun } = await import("@/lib/tenant/data");
      await expect(
        createScoringRun({
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        }),
      ).rejects.toThrow(/archived/i);
    });

    it("a list with scoring history archives rather than hard-deletes", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const list = await prisma.contactList.create({
        data: { organizationId: orgA, name: `Scored list ${suffix}` },
      });
      const contact = await prisma.contact.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          email: `scored-list-${suffix}@example.test`,
        },
      });
      await prisma.scoringRun.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          status: "COMPLETED",
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: {},
        },
      });
      const { deleteOrArchiveContactList } = await import(
        "@/lib/tenant/list-delete"
      );
      const result = await deleteOrArchiveContactList(list.id);
      expect(result.mode).toBe("archived");
      const kept = await prisma.contactList.findUnique({ where: { id: list.id } });
      expect(kept?.archivedAt).not.toBeNull();
      expect(
        await prisma.contact.findUnique({ where: { id: contact.id } }),
      ).not.toBeNull();
    });

    it("a list attached to an active campaign blocks delete and offers archive", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const list = await prisma.contactList.create({
        data: { organizationId: orgA, name: `Active-campaign list ${suffix}` },
      });
      const contact = await prisma.contact.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          email: `active-camp-${suffix}@example.test`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgA,
          name: `Active ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        },
      });
      await prisma.campaignContact.create({
        data: {
          organizationId: orgA,
          campaignId: campaign.id,
          contactId: contact.id,
        },
      });
      const { deleteOrArchiveContactList, archiveContactList } = await import(
        "@/lib/tenant/list-delete"
      );
      await expect(deleteOrArchiveContactList(list.id)).rejects.toBeInstanceOf(
        TenantError,
      );
      await expect(deleteOrArchiveContactList(list.id)).rejects.toThrow(
        /archive/i,
      );
      const archived = await archiveContactList(list.id);
      expect(archived.mode).toBe("archived");
      expect(
        await prisma.campaignContact.findFirst({
          where: { campaignId: campaign.id, contactId: contact.id },
        }),
      ).not.toBeNull();
    });

    it("hard-deleting a list does not orphan contacts referenced elsewhere", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const disposable = await prisma.contactList.create({
        data: { organizationId: orgA, name: `Disposable ${suffix}` },
      });
      const disposableContact = await prisma.contact.create({
        data: {
          organizationId: orgA,
          contactListId: disposable.id,
          email: `disposable-${suffix}@example.test`,
        },
      });
      const referenced = await prisma.contactList.create({
        data: { organizationId: orgA, name: `Referenced ${suffix}` },
      });
      const referencedContact = await prisma.contact.create({
        data: {
          organizationId: orgA,
          contactListId: referenced.id,
          email: `referenced-${suffix}@example.test`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgA,
          name: `Keep ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        },
      });
      await prisma.campaignContact.create({
        data: {
          organizationId: orgA,
          campaignId: campaign.id,
          contactId: referencedContact.id,
        },
      });

      const { deleteOrArchiveContactList } = await import(
        "@/lib/tenant/list-delete"
      );
      const deleted = await deleteOrArchiveContactList(disposable.id);
      expect(deleted.mode).toBe("deleted");
      expect(
        await prisma.contact.findUnique({ where: { id: disposableContact.id } }),
      ).toBeNull();

      await expect(deleteOrArchiveContactList(referenced.id)).rejects.toThrow(
        /campaign/i,
      );
      expect(
        await prisma.contact.findUnique({ where: { id: referencedContact.id } }),
      ).not.toBeNull();
      expect(
        await prisma.campaignContact.count({
          where: { campaignId: campaign.id, contactId: referencedContact.id },
        }),
      ).toBe(1);
    });
  },
);
