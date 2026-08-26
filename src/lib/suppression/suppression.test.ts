/**
 * Organization-level email suppression: generation, send, import, tenancy.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantError } from "@/lib/tenant/errors";
import { buildEmailPrompt } from "@/lib/email-generation/prompt";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import { seedContactOnList } from "@/test/contact-seed";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

function contextFor(input: {
  organizationId: string;
  campaignId: string;
  campaignContactId: string;
  contactId: string;
  email: string;
}): EmailGenerationContext {
  return {
    organizationId: input.organizationId,
    userId: "user_suppression_test",
    campaignContact: {
      id: input.campaignContactId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    campaign: {
      id: input.campaignId,
      name: "Outreach",
      offerName: "Working session",
      offerDescription: "A 20-minute review",
      offerCta: "Reply with a time that works",
      offerNotes: null,
      offerValidationJson: null,
      offerValidationHash: null,
      emailLength: "MEDIUM",
      emailGuidance: null,
    },
    emailLength: "MEDIUM",
    contact: {
      id: input.contactId,
      firstName: "Alex",
      lastName: "Rivera",
      email: input.email,
      title: "Leader",
      company: "Example Co",
      industry: null,
      location: null,
    },
    product: {
      id: "product_1",
      name: "Example Product",
      description: "Helps operators",
      valueProposition: null,
      evidence: [],
      problemsSolved: [],
      messaging: {
        primaryPositioning: [],
        coreValueThemes: [],
        strongestDifferentiators: [],
        proofPoints: [],
        supportedClaims: [],
        claimsNotToMake: [],
        terminologyToUse: [],
        terminologyToAvoid: [],
      },
    },
    persona: {
      id: "persona_1",
      name: "Operator",
      painPoints: [],
      desiredOutcomes: [],
      messagingNotes: [],
      messaging: {
        positioning: [],
        proofPoints: [],
        objections: [],
      },
      profile: {
        terminology: [],
        organizationalPressures: [],
        buyingRole: [],
        decisionInfluence: [],
      },
    },
    icp: {
      id: "icp_1",
      name: "Target",
      definition: null,
      description: null,
    },
    contactResearch: null,
    companyResearch: null,
    personaResolution: {
      source: "campaign_fallback",
      usedCampaignFallback: true,
    },
    voiceSamples: [],
    sequence: [],
  };
}

describe.skipIf(!hasDatabase)(
  "Email suppression",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let orgA = "";
    let orgB = "";
    let userAId = "";
    let userBId = "";
    const suffix = Date.now().toString(36);
    const previousBypass = process.env.ALLOW_DEV_TENANT_BYPASS;
    const previousOrg = process.env.DEV_ORGANIZATION_ID;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "normalizedEmail" FROM "EmailSuppression" LIMIT 0`;
        const a = await prisma.organization.create({
          data: {
            name: `[TEST] Suppress A ${suffix}`,
            slug: `test-suppress-a-${suffix}`,
          },
        });
        const b = await prisma.organization.create({
          data: {
            name: `[TEST] Suppress B ${suffix}`,
            slug: `test-suppress-b-${suffix}`,
          },
        });
        orgA = a.id;
        orgB = b.id;
        const userA = await prisma.user.create({
          data: {
            email: `suppress-a-${suffix}@example.test`,
            emailNormalized: `suppress-a-${suffix}@example.test`,
            name: "Suppress A",
          },
        });
        const userB = await prisma.user.create({
          data: {
            email: `suppress-b-${suffix}@example.test`,
            emailNormalized: `suppress-b-${suffix}@example.test`,
            name: "Suppress B",
          },
        });
        userAId = userA.id;
        userBId = userB.id;
        await prisma.organizationMembership.create({
          data: {
            organizationId: orgA,
            userId: userAId,
            role: "OWNER",
          },
        });
        await prisma.user.update({
          where: { id: userAId },
          data: { activeOrganizationId: orgA },
        });
        process.env.ALLOW_DEV_TENANT_BYPASS = "true";
        process.env.DEV_ORGANIZATION_ID = orgA;
        ready = true;
      } catch (e) {
        console.warn("Skipping suppression DB tests — run db:test:migrate:", e);
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
      if (orgB) {
        await prisma.organization.delete({ where: { id: orgB } }).catch(() => undefined);
      }
      if (userAId) {
        await prisma.user.delete({ where: { id: userAId } }).catch(() => undefined);
      }
      if (userBId) {
        await prisma.user.delete({ where: { id: userBId } }).catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    async function seedCampaign(organizationId: string, email: string) {
      const product = await prisma.product.create({
        data: { organizationId, name: `Product ${email}` },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId,
          productId: product.id,
          name: `ICP ${email}`,
        },
      });
      const list = await prisma.contactList.create({
        data: { organizationId, name: `List ${email}` },
      });
      const contact = await seedContactOnList(prisma, {
        organizationId,
        contactListId: list.id,
        firstName: "Alex",
        lastName: "Rivera",
        email,
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          name: `Campaign ${email}`,
          productId: product.id,
          icpId: icp.id,
          offerName: "Audit",
        },
      });
      const campaignContact = await prisma.campaignContact.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          contactId: contact.id,
        },
      });
      return { product, icp, list, contact, campaign, campaignContact };
    }

    it("blocks generation server-side for a suppressed contact", async () => {
      if (!ready) return;
      const email = `gen-${suffix}@example.test`;
      const seeded = await seedCampaign(orgA, email);
      const { suppressEmail } = await import("@/lib/suppression/service");
      await suppressEmail({
        organizationId: orgA,
        email,
        actorUserId: userAId,
      });
      const { generateEmailDraft } = await import(
        "@/lib/email-generation/service"
      );
      const context = contextFor({
        organizationId: orgA,
        campaignId: seeded.campaign.id,
        campaignContactId: seeded.campaignContact.id,
        contactId: seeded.contact.id,
        email,
      });
      await expect(
        generateEmailDraft(context, buildEmailPrompt(context)),
      ).rejects.toBeInstanceOf(TenantError);
      await expect(
        generateEmailDraft(context, buildEmailPrompt(context)),
      ).rejects.toThrow(/do-not-contact/i);
    });

    it("blocks send including sequence follow-up / mark-sent", async () => {
      if (!ready) return;
      const email = `send-${suffix}@example.test`;
      const seeded = await seedCampaign(orgA, email);
      const draft = await prisma.emailDraft.create({
        data: {
          organizationId: orgA,
          campaignContactId: seeded.campaignContact.id,
          sequenceNumber: 1,
          subject: "Hello",
          body: "Hi there",
          status: "DRAFT",
          kind: "INITIAL",
        },
      });
      const { suppressEmail } = await import("@/lib/suppression/service");
      await suppressEmail({
        organizationId: orgA,
        email,
        actorUserId: userAId,
      });
      const { markEmailDraftSent } = await import(
        "@/lib/email-generation/sequence"
      );
      await expect(
        markEmailDraftSent({ draftId: draft.id, userId: userAId }),
      ).rejects.toThrow(/do-not-contact/i);

      const followUpContext = contextFor({
        organizationId: orgA,
        campaignId: seeded.campaign.id,
        campaignContactId: seeded.campaignContact.id,
        contactId: seeded.contact.id,
        email,
      });
      followUpContext.sequence = [
        {
          id: draft.id,
          sequenceNumber: 1,
          kind: "INITIAL",
          subject: "Hello",
          body: "Hi there",
          status: "SENT",
          sentAt: new Date(),
          replyClassification: null,
          prospectReplyText: null,
          referralSuggested: false,
          inReplyToDraftId: null,
        },
      ];
      const { generateEmailDraft } = await import(
        "@/lib/email-generation/service"
      );
      await expect(
        generateEmailDraft(followUpContext, buildEmailPrompt(followUpContext), {
          sequenceNumber: 2,
          kind: "FOLLOW_UP",
        }),
      ).rejects.toThrow(/do-not-contact/i);
    });

    it("re-importing a suppressed address is flagged and still imported", async () => {
      if (!ready) return;
      const email = `import-${suffix}@example.test`;
      const { suppressEmail } = await import("@/lib/suppression/service");
      await suppressEmail({
        organizationId: orgA,
        email,
        actorUserId: userAId,
      });
      const { importContactList } = await import("@/lib/tenant/data");
      const result = await importContactList({
        name: `Reimport ${suffix}`,
        sourceType: "PASTE",
        contacts: [
          {
            firstName: "Alex",
            lastName: "Rivera",
            email,
            title: null,
            company: null,
            companyWebsite: null,
            industry: null,
            employeeCount: null,
            revenue: null,
            location: null,
            linkedinUrl: null,
            phone: null,
            rawData: {},
          },
        ],
      });
      expect(result.importedCount).toBe(1);
      expect(result.suppressedCount).toBe(1);
    });

    it("suppression in org A does not affect the same address in org B", async () => {
      if (!ready) return;
      const email = `cross-${suffix}@example.test`;
      const { suppressEmail, isEmailSuppressed } = await import(
        "@/lib/suppression/service"
      );
      await suppressEmail({
        organizationId: orgA,
        email,
        actorUserId: userAId,
      });
      expect(await isEmailSuppressed(orgA, email)).toBe(true);
      expect(await isEmailSuppressed(orgB, email)).toBe(false);
      expect(
        await isEmailSuppressed(orgA, `cross-${suffix}+news@example.test`),
      ).toBe(true);
    });

    it("un-suppressing restores the contact and records who did it", async () => {
      if (!ready) return;
      const email = `restore-${suffix}@example.test`;
      const { suppressEmail, releaseSuppression, isEmailSuppressed } =
        await import("@/lib/suppression/service");
      await suppressEmail({
        organizationId: orgA,
        email,
        actorUserId: userAId,
      });
      expect(await isEmailSuppressed(orgA, email)).toBe(true);
      const released = await releaseSuppression({
        organizationId: orgA,
        email,
        actorUserId: userAId,
      });
      expect(released.status).toBe("RELEASED");
      expect(released.releasedById).toBe(userAId);
      expect(released.releasedAt).not.toBeNull();
      expect(await isEmailSuppressed(orgA, email)).toBe(false);
    });

    it("createScoringRun marks suppressed contacts instead of dropping them", async () => {
      if (!ready) return;
      const email = `score-${suffix}@example.test`;
      const { product, icp, list } = await seedCampaign(orgA, email);
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Score persona ${suffix}`,
        },
      });
      const { suppressEmail } = await import("@/lib/suppression/service");
      await suppressEmail({
        organizationId: orgA,
        email,
        actorUserId: userAId,
      });
      const { createScoringRun } = await import("@/lib/tenant/data");
      const run = await createScoringRun({
        contactListId: list.id,
        productId: product.id,
        icpId: icp.id,
        personaId: persona.id,
      });
      const scores = await prisma.contactScore.findMany({
        where: { scoringRunId: run.id },
      });
      expect(scores).toHaveLength(1);
      expect(scores[0]?.scoringStatus).toBe("SUPPRESSED");
      expect(scores[0]?.scoringError).toMatch(/suppression/i);
    });
  },
);
