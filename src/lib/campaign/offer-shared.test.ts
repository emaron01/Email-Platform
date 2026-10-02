/**
 * Setup and Emails share one campaign offer record.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { campaignOfferView } from "@/lib/campaign/offer-fields";

describe("campaign offer view", () => {
  it("prefers campaign columns and fills blanks from a legacy offer", () => {
    expect(
      campaignOfferView({
        offerName: "Column name",
        offerDescription: null,
        offerCta: "Book",
        offerNotes: null,
        offer: {
          name: "Linked name",
          description: "Linked description",
          primaryCta: "Linked CTA",
          notes: "Linked notes",
        },
      }),
    ).toEqual({
      offerName: "Column name",
      offerDescription: "Linked description",
      offerCta: "Book",
      offerNotes: "Linked notes",
    });
  });

  it("both stages render that same view", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    const setup = page.slice(
      page.indexOf('currentStage === "setup"'),
      page.indexOf('currentStage === "emails"'),
    );
    const emails = page.slice(
      page.indexOf('currentStage === "emails"'),
      page.indexOf('currentStage === "list"'),
    );
    expect(page).toContain("const offer = campaignOfferView(campaign)");
    expect(setup).toContain("offer={offer}");
    expect(emails).toContain("offer={offer}");
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "shared campaign offer persistence",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let organizationId = "";
    let ownerId = "";
    let productId = "";
    let icpId = "";
    const suffix = Date.now().toString(36);
    const previousBypass = process.env.ALLOW_DEV_TENANT_BYPASS;
    const previousOrg = process.env.DEV_ORGANIZATION_ID;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "offerName", "emailGuidance" FROM "Campaign" LIMIT 0`;
        const org = await prisma.organization.create({
          data: {
            name: `[TEST] Offer share ${suffix}`,
            slug: `test-offer-share-${suffix}`,
          },
        });
        organizationId = org.id;
        const owner = await prisma.user.create({
          data: {
            email: `offer-share-${suffix}@example.test`,
            emailNormalized: `offer-share-${suffix}@example.test`,
            name: "Offer Share Owner",
          },
        });
        ownerId = owner.id;
        await prisma.organizationMembership.create({
          data: {
            organizationId,
            userId: owner.id,
            role: "OWNER",
          },
        });
        const product = await prisma.product.create({
          data: { organizationId, name: `Product ${suffix}` },
        });
        productId = product.id;
        const icp = await prisma.icp.create({
          data: { organizationId, productId, name: `ICP ${suffix}` },
        });
        icpId = icp.id;
        process.env.ALLOW_DEV_TENANT_BYPASS = "true";
        process.env.DEV_ORGANIZATION_ID = organizationId;
        ready = true;
      } catch (error) {
        console.warn(
          "Skipping shared offer DB tests — run db:test:migrate:",
          error,
        );
      }
    });

    afterAll(async () => {
      if (previousBypass == null) delete process.env.ALLOW_DEV_TENANT_BYPASS;
      else process.env.ALLOW_DEV_TENANT_BYPASS = previousBypass;
      if (previousOrg == null) delete process.env.DEV_ORGANIZATION_ID;
      else process.env.DEV_ORGANIZATION_ID = previousOrg;
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    async function loadOffer(campaignId: string) {
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaignId },
        include: {
          offer: {
            select: {
              name: true,
              description: true,
              primaryCta: true,
              notes: true,
            },
          },
        },
      });
      return campaignOfferView(campaign);
    }

    it("shows an existing saved offer, then each save updates that same record", async () => {
      if (!ready) return;
      const existing = {
        offerName: "Forecast audit",
        offerDescription: "A working session on the forecast.",
        offerCta: "Book the audit",
        offerNotes: "Keep it specific.",
      };
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: ownerId,
          name: `Existing offer ${suffix}`,
          productId,
          icpId,
          ...existing,
        },
      });

      expect(await loadOffer(campaign.id)).toEqual(existing);

      const { updateCampaignOffer } = await import("@/lib/campaign/settings");
      const fromEmails = {
        offerName: "Emails-stage pilot",
        offerDescription: "Saved from the Emails stage.",
        offerCta: "Start from Emails",
        offerNotes: "One record.",
      };
      await updateCampaignOffer({
        campaignId: campaign.id,
        ...fromEmails,
        offerValidationJson: {
          conflicts: [],
          semanticValidationCompleted: true,
        },
        offerValidationHash: "emails-save",
      });
      expect(await loadOffer(campaign.id)).toEqual(fromEmails);

      const fromSetup = {
        offerName: "Setup-stage pilot",
        offerDescription: "Saved from Setup.",
        offerCta: "Start from Setup",
        offerNotes: "Still one record.",
      };
      await updateCampaignOffer({
        campaignId: campaign.id,
        ...fromSetup,
        offerValidationJson: {
          conflicts: [],
          semanticValidationCompleted: true,
        },
        offerValidationHash: "setup-save",
      });
      expect(await loadOffer(campaign.id)).toEqual(fromSetup);
    });

    it("displays a legacy linked offer when campaign columns are empty", async () => {
      if (!ready) return;
      const legacy = await prisma.offer.create({
        data: {
          organizationId,
          name: "Legacy audit",
          description: "From the offer table",
          primaryCta: "Talk",
          notes: "Legacy notes",
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: ownerId,
          name: `Legacy offer ${suffix}`,
          productId,
          icpId,
          offerId: legacy.id,
        },
      });
      expect(await loadOffer(campaign.id)).toEqual({
        offerName: "Legacy audit",
        offerDescription: "From the offer table",
        offerCta: "Talk",
        offerNotes: "Legacy notes",
      });
    });

    it("stores email guidance of 2000 characters and rejects 2001", async () => {
      if (!ready) return;
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: ownerId,
          name: `Guidance length ${suffix}`,
          productId,
          icpId,
        },
      });
      const { updateCampaignEmailSettings } = await import(
        "@/lib/campaign/settings"
      );
      const guidance = "g".repeat(2000);
      await updateCampaignEmailSettings({
        campaignId: campaign.id,
        emailLength: "LONG",
        emailGuidance: guidance,
      });
      const stored = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
        select: { emailGuidance: true },
      });
      expect(stored.emailGuidance).toBe(guidance);

      await expect(
        updateCampaignEmailSettings({
          campaignId: campaign.id,
          emailLength: "LONG",
          emailGuidance: "g".repeat(2001),
        }),
      ).rejects.toThrow(/2000 characters or fewer/);
      const unchanged = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
        select: { emailGuidance: true },
      });
      expect(unchanged.emailGuidance).toBe(guidance);
    });
  },
);
