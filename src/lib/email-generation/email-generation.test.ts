import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import { buildEmailPrompt } from "@/lib/email-generation/prompt";
import { TenantError } from "@/lib/tenant/errors";

config({ path: ".env.local" });
config();

function contextFixture(
  overrides: Partial<EmailGenerationContext> = {},
): EmailGenerationContext {
  return {
    organizationId: "org_1",
    userId: "user_1",
    campaignContact: {
      id: "cc_1",
      campaignId: "campaign_1",
      contactId: "contact_1",
    },
    campaign: {
      id: "campaign_1",
      name: "CRO outreach",
      offerName: "Forecast audit",
      offerDescription: "A review of forecast process gaps",
      offerCta: "Reply with a time for a 20-minute review",
      offerNotes: null,
    },
    contact: {
      id: "contact_1",
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex@example.test",
      title: "Chief Revenue Officer",
      company: "Acme",
      industry: "Software",
      location: "New York",
    },
    product: {
      id: "product_1",
      name: "Forecast OS",
      description: "Forecasting software",
      valueProposition: "More reliable forecasts",
      messaging: {
        primaryPositioning: ["A forecast operating system"],
        coreValueThemes: ["Consistency"],
        strongestDifferentiators: ["Rep-level evidence"],
        proofPoints: ["Auditable forecast changes"],
        supportedClaims: ["Improves forecast process visibility"],
        claimsNotToMake: ["Guaranteed revenue growth"],
        terminologyToUse: ["forecast confidence"],
        terminologyToAvoid: ["magic"],
      },
    },
    persona: {
      id: "persona_1",
      name: "CRO",
      painPoints: ["Forecast calls rely on anecdotes"],
      desiredOutcomes: ["A defensible commit"],
      messaging: {
        positioning: ["Make forecast changes explainable"],
        proofPoints: ["Evidence at opportunity level"],
        objections: ["Another system for reps"],
      },
      profile: {
        terminology: ["commit", "pipeline coverage"],
        organizationalPressures: ["Board scrutiny"],
        buyingRole: ["Economic buyer"],
        decisionInfluence: ["Final approval"],
      },
    },
    icp: {
      id: "icp_1",
      name: "Mid-market SaaS",
      definition: "B2B SaaS with a multi-rep sales team",
      description: null,
    },
    contactResearch: {
      id: "research_1",
      currentTitle: "Chief Revenue Officer",
      roleSummary: "Owns forecast accuracy",
      responsibilities: ["Revenue forecast"],
      ownershipAreas: ["Pipeline"],
      professionalSignals: ["New planning process"],
      negativeRoleSignals: [],
      confidence: "HIGH",
      researchedAt: new Date(),
    },
    voiceSamples: [
      {
        id: "voice_new",
        label: "Recent email",
        sampleText: "FIRST VOICE SAMPLE",
        createdAt: new Date(),
      },
      {
        id: "voice_old",
        label: "Older email",
        sampleText: "SECOND VOICE SAMPLE",
        createdAt: new Date(0),
      },
    ],
    ...overrides,
  };
}

describe("buildEmailPrompt", () => {
  it("builds one system and one user message in the required priority order", () => {
    const messages = buildEmailPrompt(contextFixture());
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");

    const prompt = messages[1].content;
    const offer = prompt.indexOf('"offer"');
    const needs = prompt.indexOf('"personaNeeds"');
    const persona = prompt.indexOf('"personaMessaging"');
    const product = prompt.indexOf('"productMessaging"');
    const contact = prompt.indexOf('"contactContext"');
    const voice = prompt.indexOf('"voiceStyle"');
    expect([offer, needs, persona, product, contact, voice]).toEqual(
      [...[offer, needs, persona, product, contact, voice]].sort(
        (a, b) => a - b,
      ),
    );
    expect(prompt).toContain("FIRST VOICE SAMPLE");
    expect(prompt).not.toContain("SECOND VOICE SAMPLE");
    expect(messages[0].content).toMatch(/JSON only/i);
    expect(messages[0].content).toMatch(/No markdown/i);
  });

  it("keeps generation usable when optional messaging and research are empty", () => {
    const context = contextFixture({
      contactResearch: null,
      voiceSamples: [],
      product: {
        ...contextFixture().product,
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
        ...contextFixture().persona,
        painPoints: [],
        desiredOutcomes: [],
        messaging: { positioning: [], proofPoints: [], objections: [] },
        profile: {
          terminology: [],
          organizationalPressures: [],
          buyingRole: [],
          decisionInfluence: [],
        },
      },
    });
    const messages = buildEmailPrompt(context);
    expect(messages[1].content).toContain('"freshRoleResearch": null');
    expect(messages[1].content).toContain('"voiceStyle": null');
    expect(messages[1].content).toContain('"supportedClaims": []');
  });
});

describe("email generation action and UI seams", () => {
  it("returns a typed result and renders the generated draft inline", () => {
    const action = readFileSync("src/app/actions/email.ts", "utf8");
    const form = readFileSync(
      "src/components/GenerateEmailDraftForm.tsx",
      "utf8",
    );
    const campaignPage = readFileSync(
      "src/app/(app)/campaigns/page.tsx",
      "utf8",
    );

    expect(action).toMatch(
      /generateEmailDraftAction\([\s\S]*Promise<GenerateEmailDraftActionResult>/,
    );
    expect(action).toContain("loadEmailGenerationContext");
    expect(action).toContain("buildEmailPrompt");
    expect(action).toContain("generateEmailDraft");
    expect(action).toContain("requireVerifiedForAiSpend");
    expect(form).toContain("Generate Email");
    expect(form).toContain("email-generation-status");
    expect(form).toContain("result.subject");
    expect(form).toContain("result.body");
    expect(form).not.toMatch(/send email|mailto|clipboard/i);
    expect(campaignPage).toContain("GenerateEmailDraftForm");
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "email generation context and persistence",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    const organizationIds: string[] = [];
    const userIds: string[] = [];
    let organizationId = "";
    let userAId = "";
    let userBId = "";
    let campaignContactId = "";
    let foreignCampaignContactId = "";
    let contactId = "";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "source" FROM "EmailDraft" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping email generation DB tests: apply pending Prisma migrations first.",
        );
        return;
      }

      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const primary = await createIndividualWorkspace({
        email: `email-gen-a-${suffix}@example.test`,
        name: "Generator A",
      });
      organizationId = primary.organization.id;
      userAId = primary.user.id;
      organizationIds.push(organizationId);
      userIds.push(userAId);

      const userB = await prisma.user.create({
        data: {
          email: `email-gen-b-${suffix}@example.test`,
          emailNormalized: `email-gen-b-${suffix}@example.test`,
          name: "Generator B",
          activeOrganizationId: organizationId,
        },
      });
      userBId = userB.id;
      userIds.push(userBId);
      await prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: userBId,
          role: "MEMBER",
        },
      });

      const product = await prisma.product.create({
        data: {
          organizationId,
          name: "Forecast OS",
          description: "Forecasting software",
          messagingJson: {
            supportedClaims: ["Improves forecast visibility"],
            claimsNotToMake: ["Guaranteed growth"],
            terminologyToAvoid: ["magic"],
          },
        },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId,
          productId: product.id,
          name: "SaaS",
          definition: "B2B SaaS revenue teams",
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          name: "CRO",
          painPoints: "Unreliable commits",
          desiredOutcomes: "Defensible forecasts",
          personaMessagingJson: {
            positioning: ["Explain forecast movement"],
            proofPoints: ["Opportunity evidence"],
            objections: ["Rep adoption"],
          },
          profileJson: { terminology: ["commit"] },
        },
      });
      const list = await prisma.contactList.create({
        data: {
          organizationId,
          name: "Email generation contacts",
          sourceType: "PASTE",
          totalContacts: 1,
        },
      });
      const contact = await prisma.contact.create({
        data: {
          organizationId,
          contactListId: list.id,
          firstName: "Alex",
          email: `alex-${suffix}@example.test`,
          title: "Chief Revenue Officer",
          company: "Acme",
        },
      });
      contactId = contact.id;
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          name: "CRO campaign",
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          offerName: "Forecast audit",
          offerCta: "Reply to book 20 minutes",
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
      campaignContactId = campaignContact.id;

      await prisma.voiceSample.createMany({
        data: [
          {
            organizationId,
            userId: userAId,
            label: "Older",
            sampleText: "Older voice sample ".repeat(10),
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            organizationId,
            userId: userAId,
            label: "Newest",
            sampleText: "Newest voice sample ".repeat(10),
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
          },
          {
            organizationId,
            userId: userBId,
            label: "Other user",
            sampleText: "This must never leak ".repeat(10),
          },
        ],
      });
      await prisma.contactResearch.create({
        data: {
          organizationId,
          contactId: contact.id,
          status: "COMPLETED",
          confidence: "HIGH",
          roleSummary: "Owns forecast accuracy",
          responsibilities: ["Revenue forecast"],
          researchedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const foreign = await createIndividualWorkspace({
        email: `email-gen-foreign-${suffix}@example.test`,
        name: "Foreign Generator",
      });
      organizationIds.push(foreign.organization.id);
      userIds.push(foreign.user.id);
      const foreignProduct = await prisma.product.create({
        data: {
          organizationId: foreign.organization.id,
          name: "Foreign product",
        },
      });
      const foreignIcp = await prisma.icp.create({
        data: {
          organizationId: foreign.organization.id,
          productId: foreignProduct.id,
          name: "Foreign ICP",
        },
      });
      const foreignPersona = await prisma.persona.create({
        data: {
          organizationId: foreign.organization.id,
          productId: foreignProduct.id,
          name: "Foreign persona",
        },
      });
      const foreignList = await prisma.contactList.create({
        data: {
          organizationId: foreign.organization.id,
          name: "Foreign list",
          totalContacts: 1,
        },
      });
      const foreignContact = await prisma.contact.create({
        data: {
          organizationId: foreign.organization.id,
          contactListId: foreignList.id,
          email: `foreign-${suffix}@example.test`,
        },
      });
      const foreignCampaign = await prisma.campaign.create({
        data: {
          organizationId: foreign.organization.id,
          name: "Foreign campaign",
          productId: foreignProduct.id,
          icpId: foreignIcp.id,
          personaId: foreignPersona.id,
        },
      });
      foreignCampaignContactId = (
        await prisma.campaignContact.create({
          data: {
            organizationId: foreign.organization.id,
            campaignId: foreignCampaign.id,
            contactId: foreignContact.id,
          },
        })
      ).id;
      ready = true;
    }, 60_000);

    afterAll(async () => {
      vi.unstubAllGlobals();
      for (const id of organizationIds) {
        await prisma.organization
          .delete({ where: { id } })
          .catch(() => undefined);
      }
      if (userIds.length > 0) {
        await prisma.user
          .deleteMany({ where: { id: { in: userIds } } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    }, 60_000);

    it("loads direct messaging JSON, only the caller's voices, and fresh research", async () => {
      if (!ready) return;
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(context.product.messaging.supportedClaims).toEqual([
        "Improves forecast visibility",
      ]);
      expect(context.product.messaging.proofPoints).toEqual([]);
      expect(context.persona.messaging.positioning).toEqual([
        "Explain forecast movement",
      ]);
      expect(context.persona.profile.terminology).toEqual(["commit"]);
      expect(context.voiceSamples.map((sample) => sample.label)).toEqual([
        "Newest",
        "Older",
      ]);
      expect(context.contactResearch?.roleSummary).toBe(
        "Owns forecast accuracy",
      );
    });

    it("returns null for low-confidence or older-than-90-day research", async () => {
      if (!ready) return;
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      await prisma.contactResearch.update({
        where: {
          organizationId_contactId: { organizationId, contactId },
        },
        data: {
          confidence: "LOW",
          researchedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      expect(
        (
          await loadEmailGenerationContext(campaignContactId, userAId)
        ).contactResearch,
      ).toBeNull();

      await prisma.contactResearch.update({
        where: {
          organizationId_contactId: { organizationId, contactId },
        },
        data: {
          confidence: "HIGH",
          researchedAt: new Date("2025-01-01T00:00:00.000Z"),
          expiresAt: new Date("2025-04-01T00:00:00.000Z"),
        },
      });
      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      expect(context.contactResearch).toBeNull();
    });

    it("rejects a CampaignContact owned by another organization", async () => {
      if (!ready) return;
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      await expect(
        loadEmailGenerationContext(foreignCampaignContactId, userAId),
      ).rejects.toBeInstanceOf(TenantError);
    });

    it("calls gpt-5.6-luna, creates one AI draft, and records usage", async () => {
      if (!ready) return;
      const { clearAiProviderCache } = await import("@/lib/ai/provider");
      const { loadEmailGenerationContext } = await import(
        "@/lib/email-generation/context"
      );
      const { generateEmailDraft } = await import(
        "@/lib/email-generation/service"
      );

      process.env.EMAIL_AI_PROVIDER = "openai-responses";
      process.env.EMAIL_AI_MODEL = "gpt-5.6-luna";
      process.env.EMAIL_AI_MODEL_URL =
        "https://api.openai.com/v1/responses";
      process.env.EMAIL_AI_API_KEY = "email-test-secret";
      process.env.EMAIL_AI_MAX_RETRIES = "0";
      clearAiProviderCache();

      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const request = JSON.parse(String(init?.body ?? "{}"));
          expect(request.model).toBe("gpt-5.6-luna");
          expect(request.tools).toBeUndefined();
          expect(request.temperature).toBeUndefined();
          return new Response(
            JSON.stringify({
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify({
                        subject: "A more defensible forecast",
                        body: "Hi Alex,\\n\\nWould a forecast audit be useful?",
                        reasoning: "Connects the offer to forecast ownership.",
                      }),
                    },
                  ],
                },
              ],
              usage: { input_tokens: 20, output_tokens: 12 },
            }),
            { status: 200 },
          );
        }),
      );

      const context = await loadEmailGenerationContext(
        campaignContactId,
        userAId,
      );
      const created = await generateEmailDraft(
        context,
        buildEmailPrompt(context),
      );
      expect(created.subject).toBe("A more defensible forecast");

      const draft = await prisma.emailDraft.findUniqueOrThrow({
        where: {
          organizationId_campaignContactId_sequenceNumber: {
            organizationId,
            campaignContactId,
            sequenceNumber: 1,
          },
        },
      });
      expect(draft.status).toBe("DRAFT");
      expect(draft.source).toBe("AI");

      const event = await prisma.usageEvent.findFirstOrThrow({
        where: {
          organizationId,
          userId: userAId,
          operation: "EMAIL_DRAFT_CREATED",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(event.category).toBe("EMAIL_GENERATION");
      expect(event.status).toBe("SUCCESS");
      expect(event.model).toBe("gpt-5.6-luna");
      expect(event.inputTokens).toBe(20);
      expect(JSON.stringify(event.metadata)).not.toContain(
        "Connects the offer",
      );
    });
  },
);
