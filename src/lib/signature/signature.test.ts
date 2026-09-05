import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TenantError } from "@/lib/tenant/errors";
import { EMAIL_SIGNATURE_MAX_CHARS } from "@/lib/signature/types";

describe("email signature seams", () => {
  it("lives on Email connection settings and is appended on both send paths", () => {
    const voice = readFileSync("src/app/(app)/settings/voice/page.tsx", "utf8");
    const emailPage = readFileSync(
      "src/app/(app)/settings/email/page.tsx",
      "utf8",
    );
    const settings = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
    const form = readFileSync("src/components/EmailSignatureForm.tsx", "utf8");
    const graph = readFileSync("src/lib/mailbox/microsoft-graph.ts", "utf8");
    const send = readFileSync("src/lib/mailbox/send.ts", "utf8");
    const workspace = readFileSync(
      "src/components/EmailSequenceWorkspace.tsx",
      "utf8",
    );

    expect(emailPage).toContain("EmailSignatureForm");
    expect(voice).not.toContain("EmailSignatureForm");
    expect(voice).toContain('href="/settings/email"');
    expect(settings).toMatch(/Email connection[\s\S]*signature appended/);
    expect(workspace).toContain('href="/settings/email"');
    expect(workspace).not.toContain('href="/settings/voice"');
    expect(form).toContain("saveEmailSignatureAction");
    expect(form).toContain("email-signature-preview");
    expect(form).toContain("EMAIL_SIGNATURE_HTML_MAX_CHARS");
    expect(form).toContain('name="htmlBody"');
    expect(form).not.toMatch(/generate|openai|getAiConfig/i);
    expect(send).toContain("getEmailSignatureForSend");
    expect(send).toContain("signatureText: signature.text");
    expect(send).toContain("signatureHtml: signature.html");
    expect(send).toContain("finalBody: finalBodyForRecord");
    expect(graph).toContain("buildMicrosoftGraphSendMailPayload");
    expect(graph).toContain("signatureHtml: input.signatureHtml");
    expect(workspace).toContain(
      "appendEmailSignature(selected.body, emailSignature)",
    );
  });
});

describe("blank signature equals absent", () => {
  it("treats empty and whitespace plain signatures as no append", async () => {
    const { appendEmailSignature, buildMicrosoftGraphSendMailPayload } =
      await import("@/lib/email-generation/email-body");
    const body = "Would this be useful?\n";
    expect(appendEmailSignature(body, null)).toBe(
      "Would this be useful?\n",
    );
    expect(appendEmailSignature(body, "")).toBe("Would this be useful?\n");
    expect(appendEmailSignature(body, "   \n\t  ")).toBe(
      "Would this be useful?\n",
    );
    expect(appendEmailSignature(body, undefined)).toBe(
      "Would this be useful?\n",
    );

    for (const signatureHtml of [null, "", "   ", undefined]) {
      const payload = buildMicrosoftGraphSendMailPayload({
        to: "alex@example.com",
        subject: "Hi",
        body: "Hello",
        signatureText: "   ",
        signatureHtml,
      });
      expect(payload.message.body.contentType).toBe("Text");
      expect(payload.message.body.content).toBe("Hello");
    }
  });

  it("treats empty, whitespace, and empty-tag HTML as blank", async () => {
    const { isBlankSignatureHtml } = await import("@/lib/signature/signature");
    expect(isBlankSignatureHtml(null)).toBe(true);
    expect(isBlankSignatureHtml("")).toBe(true);
    expect(isBlankSignatureHtml("   \n")).toBe(true);
    expect(isBlankSignatureHtml("<p></p>")).toBe(true);
    expect(isBlankSignatureHtml("<div>&nbsp;</div>")).toBe(true);
    expect(isBlankSignatureHtml("<p>Alex</p>")).toBe(false);
    expect(
      isBlankSignatureHtml(
        '<p><img src="https://example.com/logo.png" alt=""></p>',
      ),
    ).toBe(false);
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "email signature persistence",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    const orgIds: string[] = [];

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "body", "htmlBody" FROM "EmailSignature" LIMIT 0`;
        ready = true;
      } catch {
        console.warn(
          "Skipping email signature DB tests: apply pending Prisma migrations first.",
        );
      }
    });

    afterAll(async () => {
      for (const id of orgIds) {
        await prisma.organization.delete({ where: { id } }).catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    it("stores plain and HTML signature per user per organization", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const {
        getActiveEmailSignatureBody,
        getEmailSignatureForSend,
        upsertEmailSignatureForUser,
      } = await import("@/lib/signature/signature");
      const { organization, user } = await createIndividualWorkspace({
        email: `sig-${suffix}@example.test`,
        name: "Sig User",
      });
      orgIds.push(organization.id);

      await expect(
        upsertEmailSignatureForUser({
          organizationId: organization.id,
          userId: user.id,
          body: "x".repeat(EMAIL_SIGNATURE_MAX_CHARS + 1),
        }),
      ).rejects.toBeInstanceOf(TenantError);

      const saved = await upsertEmailSignatureForUser({
        organizationId: organization.id,
        userId: user.id,
        body: "Alex Rivera\nhttps://example.com/meet",
        htmlBody: '<p><img src="https://example.com/logo.png" alt="Logo"></p>',
      });
      expect(saved.active).toBe(true);
      expect(saved.htmlBody).toContain("https://example.com/logo.png");
      expect(
        await getActiveEmailSignatureBody({
          organizationId: organization.id,
          userId: user.id,
        }),
      ).toBe("Alex Rivera\nhttps://example.com/meet");
      expect(
        await getEmailSignatureForSend({
          organizationId: organization.id,
          userId: user.id,
        }),
      ).toMatchObject({
        text: "Alex Rivera\nhttps://example.com/meet",
        html: expect.stringContaining("logo.png"),
      });

      const updated = await upsertEmailSignatureForUser({
        organizationId: organization.id,
        userId: user.id,
        body: "Best,\nAlex",
        htmlBody: "",
      });
      expect(updated.body).toBe("Best,\nAlex");
      expect(updated.htmlBody).toBeNull();
      expect(
        await prisma.emailSignature.count({
          where: { organizationId: organization.id, userId: user.id },
        }),
      ).toBe(1);

      const cleared = await upsertEmailSignatureForUser({
        organizationId: organization.id,
        userId: user.id,
        body: "  \n  ",
        htmlBody: "  <p></p>  ",
      });
      expect(cleared).toMatchObject({
        body: "",
        htmlBody: null,
        active: false,
      });
      expect(
        await getEmailSignatureForSend({
          organizationId: organization.id,
          userId: user.id,
        }),
      ).toEqual({ text: null, html: null });
      expect(
        await prisma.emailSignature.count({
          where: { organizationId: organization.id, userId: user.id },
        }),
      ).toBe(1);
    });
  },
);
