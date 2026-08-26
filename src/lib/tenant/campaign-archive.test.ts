/**
 * Campaign archive: hidden by default, visible with toggle, read-only, unarchivable.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantError } from "@/lib/tenant/errors";
import { campaignArchiveConfirmBody } from "@/lib/tenant/campaign-archive";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("campaign archive contracts", () => {
  it("archive confirmation states it is reversible", () => {
    const body = campaignArchiveConfirmBody();
    expect(body).toMatch(/reversible/i);
    expect(body).toMatch(/hidden/i);
  });

  it("schema has Campaign.archivedAt", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const campaign = schema.match(/model Campaign \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(campaign).toContain("archivedAt");
  });
});

describe.skipIf(!hasDatabase)(
  "Campaign archive lifecycle",
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
        await prisma.$queryRaw`SELECT "archivedAt" FROM "Campaign" LIMIT 0`;
        const org = await prisma.organization.create({
          data: {
            name: `[TEST] CampArch ${suffix}`,
            slug: `test-camp-arch-${suffix}`,
          },
        });
        orgA = org.id;
        process.env.ALLOW_DEV_TENANT_BYPASS = "true";
        process.env.DEV_ORGANIZATION_ID = orgA;
        ready = true;
      } catch (e) {
        console.warn("Skipping campaign archive DB tests — run db:test:migrate:", e);
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

    async function seedCampaign() {
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `Product ${suffix}` },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `ICP ${suffix}`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgA,
          name: `Live campaign ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          offerName: "Audit",
        },
      });
      return { product, icp, campaign };
    }

    it("is hidden by default, visible with includeArchived, unarchivable, and read-only", async () => {
      if (!ready) return;
      const { campaign } = await seedCampaign();
      const { listCampaigns } = await import("@/lib/tenant/data");
      const { archiveCampaign, unarchiveCampaign } = await import(
        "@/lib/tenant/campaign-archive"
      );
      const { getHomeWorkflow } = await import("@/lib/workflow/home");

      expect(
        (await listCampaigns()).some((row) => row.id === campaign.id),
      ).toBe(true);
      expect(
        (await getHomeWorkflow(orgA)).campaigns.some(
          (row) => row.id === campaign.id,
        ),
      ).toBe(true);

      await archiveCampaign(campaign.id);

      expect(
        (await listCampaigns()).some((row) => row.id === campaign.id),
      ).toBe(false);
      expect(
        (await listCampaigns({ includeArchived: true })).some(
          (row) => row.id === campaign.id,
        ),
      ).toBe(true);
      expect(
        (await getHomeWorkflow(orgA)).campaigns.some(
          (row) => row.id === campaign.id,
        ),
      ).toBe(false);
      expect(
        (await getHomeWorkflow(orgA, { includeArchived: true })).campaigns.some(
          (row) => row.id === campaign.id && row.archived,
        ),
      ).toBe(true);

      const { addContactsToCampaign } = await import("@/lib/campaign/contacts");
      await expect(
        addContactsToCampaign({ campaignId: campaign.id, contactIds: ["x"] }),
      ).rejects.toBeInstanceOf(TenantError);

      await unarchiveCampaign(campaign.id);
      expect(
        (await listCampaigns()).some((row) => row.id === campaign.id),
      ).toBe(true);
    });
  },
);
