import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TenantError } from "@/lib/tenant/errors";
import { EMAIL_SIGNATURE_MAX_CHARS } from "@/lib/signature/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

describe("email signature seams", () => {
  it("lives on Email connection settings (not Voice)", () => {
    const voice = readFileSync("src/app/(app)/settings/voice/page.tsx", "utf8");
    const emailPage = readFileSync(
      "src/app/(app)/settings/email/page.tsx",
      "utf8",
    );
    const settings = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
    const form = readFileSync("src/components/EmailSignatureForm.tsx", "utf8");
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
  });

  it("renders the Outlook and Gmail notice above the signature field", async () => {
    const emailPage = readFileSync(
      "src/app/(app)/settings/email/page.tsx",
      "utf8",
    );
    expect(emailPage).toContain("EmailSignatureForm");

    const { EmailSignatureForm } = await import(
      "@/components/EmailSignatureForm"
    );
    const html = renderToStaticMarkup(
      createElement(EmailSignatureForm, { signature: null }),
    );
    const noticeAt = html.indexOf('data-testid="signature-client-notice"');
    const fieldAt = html.indexOf('name="body"');
    expect(noticeAt).toBeGreaterThan(-1);
    expect(fieldAt).toBeGreaterThan(noticeAt);
    expect(html).toContain("bg-yellow-200");
    expect(html).toContain("text-black");
    expect(html).toContain('<strong class="font-bold">NOT</strong>');
    expect(html).toContain(
      "Outlook users: If you already have a signature saved in Outlook, Outlook will add it automatically. You do not need to enter a signature below.",
    );
    expect(html).toContain(
      "Gmail users: Gmail will <strong class=\"font-bold\">NOT</strong> add your signature automatically. Add your signature in the Gmail window after clicking Open in Gmail for each message. If you prefer, you can also save your signature below to have it included when composing messages in this app.",
    );
    expect(html.indexOf("Outlook users")).toBeLessThan(
      html.indexOf("Gmail users"),
    );
  });

  it("client handoff and connected send both append signature via appendEmailSignature", async () => {
    const {
      appendEmailSignature,
      buildEmailClientLaunch,
      buildMicrosoftGraphSendMailPayload,
    } = await import("@/lib/email-generation/email-body");

    const draftBody = "Would this help next quarter?";
    const signature = "Alex Rivera\nAcme";
    const withSignature = appendEmailSignature(draftBody, signature);
    expect(withSignature).toBe(`${draftBody}\n\n${signature}`);

    // Mailto / Outlook desktop handoff — same helper the workspace uses.
    const launch = buildEmailClientLaunch({
      client: "OUTLOOK_DESKTOP",
      to: "prospect@example.com",
      subject: "Quick question",
      body: withSignature,
      maxUrlLength: 8000,
    });
    expect(launch.href).toBeTruthy();
    expect(decodeURIComponent(launch.href!)).toContain("Alex Rivera");
    expect(decodeURIComponent(launch.href!)).toContain(
      "Would this help next quarter?",
    );

    // Connected Graph send — same append for the plain-text record body.
    expect(appendEmailSignature(draftBody, signature)).toBe(withSignature);
    const graph = buildMicrosoftGraphSendMailPayload({
      to: "prospect@example.com",
      subject: "Quick question",
      body: draftBody,
      signatureText: signature,
      signatureHtml: null,
    });
    expect(graph.message.body.contentType).toBe("Text");
    expect(graph.message.body.content).toContain("Alex Rivera");
    expect(graph.message.body.content).toContain(draftBody);
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
