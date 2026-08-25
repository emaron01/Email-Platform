/**
 * Campaign hard-delete lifecycle: dependents, sent-email audit, tenant isolation.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { TenantError } from "@/lib/tenant/errors";
import {
  campaignDeleteConfirmBody,
  deleteCampaignGraph,
} from "@/lib/tenant/campaign-delete";

config({ path: ".env.local" });
config();

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("campaign delete contracts", () => {
  it("confirm copy names contacts, drafts, and sent emails", () => {
    const body = campaignDeleteConfirmBody({
      contactCount: 3,
      draftCount: 5,
      sentCount: 2,
    });
    expect(body).toContain("3 campaign contact(s)");
    expect(body).toContain("5 email draft(s)");
    expect(body).toContain("2 sent email(s)");
    expect(body).toContain("send audit trail");
    expect(body).not.toMatch(/soft-archive|archived instead/i);
  });

  it("schema has no ScoringRun.campaignId; UsageEvent.campaignId is not a relation", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const scoringRun = schema.match(/model ScoringRun \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(scoringRun).toContain("model ScoringRun");
    expect(scoringRun).not.toMatch(/campaignId/);
    const usageEvent = schema.match(/model UsageEvent \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(usageEvent).toMatch(/campaignId\s+String\?/);
    expect(usageEvent).not.toMatch(/campaign\s+Campaign\s+@relation/);
  });

  it("production delete does not touch usage events or offers", () => {
    const src = readFileSync("src/lib/tenant/campaign-delete.ts", "utf8");
    expect(src).not.toMatch(/usageEvent\.(delete|deleteMany|update|updateMany)/);
    expect(src).not.toMatch(/offer\.(delete|deleteMany)/);
    expect(src).not.toMatch(/contactList\.(delete|deleteMany)/);
    expect(src).not.toMatch(/scoringRun\.(delete|deleteMany)/);
  });
});

describe.skipIf(!hasDatabase)(
  "Campaign hard-delete lifecycle",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let orgA = "";
    let orgB = "";
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "id" FROM "Campaign" LIMIT 0`;
        const a = await prisma.organization.create({
          data: { name: `CampDel A ${suffix}`, slug: `camp-del-a-${suffix}` },
        });
        const b = await prisma.organization.create({
          data: { name: `CampDel B ${suffix}`, slug: `camp-del-b-${suffix}` },
        });
        orgA = a.id;
        orgB = b.id;
        ready = true;
      } catch (e) {
        console.warn("Skipping campaign delete DB tests — run db:deploy:", e);
      }
    });

    afterAll(async () => {
      if (orgA) await prisma.organization.delete({ where: { id: orgA } }).catch(() => undefined);
      if (orgB) await prisma.organization.delete({ where: { id: orgB } }).catch(() => undefined);
      if (prisma) await prisma.$disconnect();
    });

    async function seedCampaign(organizationId: string, label: string) {
      const product = await prisma.product.create({
        data: { organizationId, name: `Product ${label} ${suffix}` },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId,
          productId: product.id,
          name: `ICP ${label} ${suffix}`,
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          name: `Persona ${label} ${suffix}`,
        },
      });
      const offer = await prisma.offer.create({
        data: { organizationId, name: `Offer ${label} ${suffix}` },
      });
      const list = await prisma.contactList.create({
        data: { organizationId, name: `List ${label} ${suffix}` },
      });
      const contact = await prisma.contact.create({
        data: {
          organizationId,
          contactListId: list.id,
          firstName: "Alex",
          lastName: label,
          email: `alex-${label}-${suffix}@example.test`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          name: `Campaign ${label} ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          offerId: offer.id,
          offerName: offer.name,
          status: "ACTIVE",
        },
      });
      const campaignContact = await prisma.campaignContact.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          contactId: contact.id,
          status: "SELECTED",
        },
      });
      return {
        product,
        icp,
        persona,
        offer,
        list,
        contact,
        campaign,
        campaignContact,
      };
    }

    it("hard-delete removes contacts, drafts, replies, and sent records with no orphans", async () => {
      if (!ready) return;
      const seeded = await seedCampaign(orgA, "graph");
      const user = await prisma.user.create({
        data: {
          email: `sender-graph-${suffix}@example.test`,
          emailNormalized: `sender-graph-${suffix}@example.test`,
          name: "Sender",
        },
      });
      const sentDraft = await prisma.emailDraft.create({
        data: {
          organizationId: orgA,
          campaignContactId: seeded.campaignContact.id,
          sequenceNumber: 1,
          subject: "First note",
          body: "Hello",
          generatedBody: "Hello",
          status: "SENT",
          sentAt: new Date(),
          sentByUserId: user.id,
          sentMethod: "MANUAL_ASSERTION",
        },
      });
      const replyDraft = await prisma.emailDraft.create({
        data: {
          organizationId: orgA,
          campaignContactId: seeded.campaignContact.id,
          sequenceNumber: 2,
          subject: "Follow up",
          body: "Checking in",
          status: "DRAFT",
          kind: "REPLY",
          inReplyToDraftId: sentDraft.id,
        },
      });
      const sendRecord = await prisma.emailSendRecord.create({
        data: {
          organizationId: orgA,
          emailDraftId: sentDraft.id,
          campaignContactId: seeded.campaignContact.id,
          recipient: seeded.contact.email ?? "alex@example.test",
          subject: "First note",
          generatedBody: "Hello",
          finalBody: "Hello",
          sentByUserId: user.id,
          method: "DEEPLINK_INTENT",
        },
      });
      await prisma.usageEvent.create({
        data: {
          organizationId: orgA,
          category: "EMAIL_GENERATION",
          operation: "EMAIL_DRAFT_SENT",
          status: "SUCCESS",
          campaignId: seeded.campaign.id,
        },
      });
      const scoringRun = await prisma.scoringRun.create({
        data: {
          organizationId: orgA,
          contactListId: seeded.list.id,
          productId: seeded.product.id,
          icpId: seeded.icp.id,
          personaId: seeded.persona.id,
          status: "COMPLETED",
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: { name: seeded.persona.name },
        },
      });

      const impact = await prisma.$transaction((tx) =>
        deleteCampaignGraph(tx, orgA, seeded.campaign.id),
      );

      expect(impact).toEqual({
        contactCount: 1,
        draftCount: 2,
        sentCount: 1,
      });
      expect(
        await prisma.campaign.findUnique({ where: { id: seeded.campaign.id } }),
      ).toBeNull();
      expect(
        await prisma.campaignContact.count({
          where: { campaignId: seeded.campaign.id },
        }),
      ).toBe(0);
      expect(
        await prisma.emailDraft.count({
          where: { id: { in: [sentDraft.id, replyDraft.id] } },
        }),
      ).toBe(0);
      expect(
        await prisma.emailSendRecord.findUnique({ where: { id: sendRecord.id } }),
      ).toBeNull();
      expect(
        await prisma.contact.findUnique({ where: { id: seeded.contact.id } }),
      ).not.toBeNull();
      expect(
        await prisma.contactList.findUnique({ where: { id: seeded.list.id } }),
      ).not.toBeNull();
      expect(
        await prisma.offer.findUnique({ where: { id: seeded.offer.id } }),
      ).not.toBeNull();
      expect(
        await prisma.scoringRun.findUnique({ where: { id: scoringRun.id } }),
      ).not.toBeNull();
      const usage = await prisma.usageEvent.findFirst({
        where: { organizationId: orgA, campaignId: seeded.campaign.id },
      });
      expect(usage).not.toBeNull();
      expect(usage?.campaignId).toBe(seeded.campaign.id);
    });

    it("does not delete another organization's campaign", async () => {
      if (!ready) return;
      const other = await seedCampaign(orgB, "other");
      await prisma.emailDraft.create({
        data: {
          organizationId: orgB,
          campaignContactId: other.campaignContact.id,
          sequenceNumber: 1,
          subject: "Other org",
          body: "Stay",
          status: "DRAFT",
        },
      });

      await expect(
        prisma.$transaction((tx) =>
          deleteCampaignGraph(tx, orgA, other.campaign.id),
        ),
      ).rejects.toBeInstanceOf(TenantError);

      expect(
        await prisma.campaign.findUnique({ where: { id: other.campaign.id } }),
      ).not.toBeNull();
      expect(
        await prisma.emailDraft.count({
          where: { organizationId: orgB, campaignContactId: other.campaignContact.id },
        }),
      ).toBe(1);
    });

    it("sent-email campaigns hard-delete; product can then be removed", async () => {
      if (!ready) return;
      const seeded = await seedCampaign(orgA, "unblock");
      const user = await prisma.user.create({
        data: {
          email: `sender-unblock-${suffix}@example.test`,
          emailNormalized: `sender-unblock-${suffix}@example.test`,
        },
      });
      const draft = await prisma.emailDraft.create({
        data: {
          organizationId: orgA,
          campaignContactId: seeded.campaignContact.id,
          sequenceNumber: 1,
          subject: "Sent",
          body: "Sent body",
          status: "SENT",
          sentAt: new Date(),
          sentByUserId: user.id,
        },
      });
      await prisma.emailSendRecord.create({
        data: {
          organizationId: orgA,
          emailDraftId: draft.id,
          campaignContactId: seeded.campaignContact.id,
          recipient: "alex@example.test",
          subject: "Sent",
          generatedBody: "Sent body",
          finalBody: "Sent body",
          sentByUserId: user.id,
          method: "DEEPLINK_INTENT",
        },
      });

      const before = await prisma.campaign.count({
        where: { organizationId: orgA, productId: seeded.product.id },
      });
      expect(before).toBeGreaterThan(0);

      await prisma.$transaction((tx) =>
        deleteCampaignGraph(tx, orgA, seeded.campaign.id),
      );

      expect(
        await prisma.campaign.count({
          where: { organizationId: orgA, productId: seeded.product.id },
        }),
      ).toBe(0);
      expect(
        await prisma.emailSendRecord.count({
          where: { organizationId: orgA, campaignContactId: seeded.campaignContact.id },
        }),
      ).toBe(0);

      await prisma.persona.delete({ where: { id: seeded.persona.id } });
      await prisma.icp.delete({ where: { id: seeded.icp.id } });
      await prisma.product.delete({ where: { id: seeded.product.id } });
      expect(
        await prisma.product.findUnique({ where: { id: seeded.product.id } }),
      ).toBeNull();
    });
  },
);
