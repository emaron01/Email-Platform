import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("mailbox secret encryption", () => {
  it("authenticates ciphertext against its user scope", async () => {
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    const {
      decryptMailboxSecret,
      encryptMailboxSecret,
      mailboxSecretAad,
    } = await import("@/lib/mailbox/crypto");
    const aadA = mailboxSecretAad({
      organizationId: "org",
      userId: "user-a",
      provider: "MICROSOFT_365",
      purpose: "access",
    });
    const aadB = mailboxSecretAad({
      organizationId: "org",
      userId: "user-b",
      provider: "MICROSOFT_365",
      purpose: "access",
    });
    const encrypted = encryptMailboxSecret("token-value", aadA);
    expect(encrypted).not.toContain("token-value");
    expect(decryptMailboxSecret(encrypted, aadA)).toBe("token-value");
    expect(() => decryptMailboxSecret(encrypted, aadB)).toThrow();
  });
});

describe.skipIf(!hasDatabase)(
  "Microsoft 365 connected send",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let organizationId = "";
    let userAId = "";
    let userBId = "";
    let campaignContactId = "";
    let nextSequence = 50;
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
        "base64",
      );
      process.env.MICROSOFT_CLIENT_ID = "test-client";
      process.env.MICROSOFT_CLIENT_SECRET = "test-secret";
      process.env.MICROSOFT_REDIRECT_URI =
        "http://localhost:3000/api/mailbox/microsoft/callback";
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const primary = await createIndividualWorkspace({
        email: `mailbox-a-${suffix}@example.test`,
        name: "Mailbox A",
      });
      organizationId = primary.organization.id;
      userAId = primary.user.id;
      const userB = await prisma.user.create({
        data: {
          email: `mailbox-b-${suffix}@example.test`,
          emailNormalized: `mailbox-b-${suffix}@example.test`,
          name: "Mailbox B",
          activeOrganizationId: organizationId,
        },
      });
      userBId = userB.id;
      await prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: userBId,
          role: "MEMBER",
        },
      });
      const product = await prisma.product.create({
        data: { organizationId, name: "General platform" },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId,
          productId: product.id,
          name: "General organizations",
          definition: "Organizations with an operational need",
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          name: "Operations leader",
        },
      });
      const list = await prisma.contactList.create({
        data: {
          organizationId,
          name: "Mailbox contacts",
          sourceType: "PASTE",
          totalContacts: 1,
        },
      });
      const contact = await prisma.contact.create({
        data: {
          organizationId,
          contactListId: list.id,
          firstName: "Alex",
          email: `recipient-${suffix}@example.test`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          name: "Mailbox campaign",
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
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      if (prisma) {
        await prisma.organization.deleteMany({
          where: { id: organizationId },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [userAId, userBId] } },
        });
        await prisma.$disconnect();
      }
    });

    async function encryptedTokens(userId: string) {
      const { encryptMailboxSecret, mailboxSecretAad } = await import(
        "@/lib/mailbox/crypto"
      );
      return {
        encryptedAccessToken: encryptMailboxSecret(
          "access-token",
          mailboxSecretAad({
            organizationId,
            userId,
            provider: "MICROSOFT_365",
            purpose: "access",
          }),
        ),
        encryptedRefreshToken: encryptMailboxSecret(
          "refresh-token",
          mailboxSecretAad({
            organizationId,
            userId,
            provider: "MICROSOFT_365",
            purpose: "refresh",
          }),
        ),
      };
    }

    async function connect(
      userId: string,
      accessTokenExpiresAt: Date,
    ): Promise<void> {
      const tokens = await encryptedTokens(userId);
      await prisma.mailboxConnection.upsert({
        where: {
          organizationId_userId_provider: {
            organizationId,
            userId,
            provider: "MICROSOFT_365",
          },
        },
        create: {
          organizationId,
          userId,
          provider: "MICROSOFT_365",
          mailboxAddress: `${userId}@example.test`,
          providerAccountId: `provider-${userId}`,
          accessTokenExpiresAt,
          grantedScopesJson: ["Mail.Send"],
          ...tokens,
        },
        update: {
          status: "CONNECTED",
          lastErrorCode: null,
          accessTokenExpiresAt,
          ...tokens,
        },
      });
    }

    async function draft() {
      return prisma.emailDraft.create({
        data: {
          organizationId,
          campaignContactId,
          sequenceNumber: nextSequence++,
          subject: "Original subject",
          body: "Original body",
          status: "DRAFT",
        },
      });
    }

    it("never uses another user connection in the same organization", async () => {
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      const { getMicrosoftAccessToken } = await import(
        "@/lib/mailbox/microsoft-oauth"
      );
      await expect(
        getMicrosoftAccessToken({ organizationId, userId: userBId }),
      ).rejects.toMatchObject({
        code: "RECONNECT_REQUIRED",
        recovery: "RECONNECT",
      });
    });

    it("refreshes an expired access token", async () => {
      await connect(userAId, new Date(Date.now() - 60_000));
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "refreshed-access",
            refresh_token: "rotated-refresh",
            expires_in: 3600,
            scope: "Mail.Send",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { getMicrosoftAccessToken } = await import(
        "@/lib/mailbox/microsoft-oauth"
      );
      const token = await getMicrosoftAccessToken({
        organizationId,
        userId: userAId,
      });
      expect(token.accessToken).toBe("refreshed-access");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("prompts reconnect after failed refresh and preserves the draft", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() - 60_000));
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "The refresh token was revoked.",
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
        ),
      );
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      await expect(
        sendEmailDraftWithConnectedMailbox({
          draftId: emailDraft.id,
          userId: userAId,
          subject: "Edited subject",
          body: "Edited body",
        }),
      ).rejects.toMatchObject({
        code: "RECONNECT_REQUIRED",
        recovery: "RECONNECT",
      });
      expect(
        await prisma.emailDraft.findUniqueOrThrow({
          where: { id: emailDraft.id },
          select: { status: true, subject: true, body: true, sentAt: true },
        }),
      ).toEqual({
        status: "DRAFT",
        subject: "Edited subject",
        body: "Edited body",
        sentAt: null,
      });
      expect(
        await prisma.mailboxConnection.findUniqueOrThrow({
          where: {
            organizationId_userId_provider: {
              organizationId,
              userId: userAId,
              provider: "MICROSOFT_365",
            },
          },
          select: { status: true },
        }),
      ).toEqual({ status: "RECONNECT_REQUIRED" });
    });

    it("keeps a rejected Graph send editable and unsent", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: "ErrorInvalidRecipients",
                message: "The recipient address is invalid.",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
        ),
      );
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      await expect(
        sendEmailDraftWithConnectedMailbox({
          draftId: emailDraft.id,
          userId: userAId,
          subject: "Final subject",
          body: "First paragraph.\n\nSecond paragraph.",
        }),
      ).rejects.toMatchObject({
        code: "SEND_REJECTED",
        recovery: "EDIT_DRAFT",
      });
      const saved = await prisma.emailDraft.findUniqueOrThrow({
        where: { id: emailDraft.id },
      });
      expect(saved.status).toBe("DRAFT");
      expect(saved.sentAt).toBeNull();
      expect(saved.body).toBe("First paragraph.\n\nSecond paragraph.");
    });

    it("marks sent only after a successful Graph response", async () => {
      const emailDraft = await draft();
      await connect(userAId, new Date(Date.now() + 60 * 60 * 1000));
      const acceptedAt = "Mon, 24 Aug 2026 20:40:00 GMT";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(null, {
            status: 202,
            headers: {
              date: acceptedAt,
              "request-id": "graph-request-123",
            },
          }),
        ),
      );
      const { sendEmailDraftWithConnectedMailbox } = await import(
        "@/lib/mailbox/send"
      );
      const sent = await sendEmailDraftWithConnectedMailbox({
        draftId: emailDraft.id,
        userId: userAId,
        subject: "Final subject",
        body: "First paragraph.\n\nSecond paragraph.",
      });
      expect(sent.sentAt.toISOString()).toBe("2026-08-24T20:40:00.000Z");
      expect(sent.providerRequestId).toBe("graph-request-123");
      expect(
        await prisma.emailDraft.findUniqueOrThrow({
          where: { id: emailDraft.id },
          select: {
            status: true,
            sentAt: true,
            sentMethod: true,
            sentByUserId: true,
          },
        }),
      ).toEqual({
        status: "SENT",
        sentAt: new Date(acceptedAt),
        sentMethod: "CONNECTED_PROVIDER",
        sentByUserId: userAId,
      });
    });
  },
);
