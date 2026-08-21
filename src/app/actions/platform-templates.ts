"use server";

import { revalidatePath } from "next/cache";
import type { TransactionalEmailTemplateKey } from "@prisma/client";
import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateTemplateContent } from "@/lib/transactional-email/render";
import { sendTransactionalEmail } from "@/lib/transactional-email/send";
import { BASELINE_TEMPLATES } from "@/lib/transactional-email/templates";

export async function saveTransactionalTemplateAction(
  formData: FormData,
): Promise<void> {
  const user = await requirePlatformSuperAdmin();
  const templateKey = String(
    formData.get("templateKey"),
  ) as TransactionalEmailTemplateKey;
  const displayName = String(formData.get("displayName") || "").trim();
  const subjectTemplate = String(formData.get("subjectTemplate") || "");
  const htmlTemplate = String(formData.get("htmlTemplate") || "");
  const textTemplate = String(formData.get("textTemplate") || "");
  const enabled = formData.get("enabled") === "true";

  validateTemplateContent({
    templateKey,
    subjectTemplate,
    htmlTemplate,
    textTemplate,
  });

  // Prevent disabling without baseline recovery
  if (!enabled) {
    const baseline = await prisma.transactionalEmailTemplateBaseline.findUnique({
      where: { templateKey },
    });
    if (!baseline && !BASELINE_TEMPLATES[templateKey]) {
      throw new Error("Cannot disable template without a baseline fallback.");
    }
  }

  const existing = await prisma.transactionalEmailTemplate.findUnique({
    where: { templateKey },
  });
  const nextVersion = (existing?.version ?? 0) + 1;

  await prisma.transactionalEmailTemplate.upsert({
    where: { templateKey },
    create: {
      templateKey,
      displayName,
      subjectTemplate,
      htmlTemplate,
      textTemplate,
      enabled,
      version: 1,
    },
    update: {
      displayName,
      subjectTemplate,
      htmlTemplate,
      textTemplate,
      enabled,
      version: nextVersion,
    },
  });

  await recordAdminAuditEvent({
    action: "TRANSACTIONAL_TEMPLATE_CHANGED",
    actorUserId: user.id,
    metadata: {
      templateKey,
      previousVersion: existing?.version ?? null,
      newVersion: existing ? nextVersion : 1,
      enabled,
    },
  });

  revalidatePath("/platform/email-templates");
}

export async function testSendTransactionalTemplateAction(
  formData: FormData,
): Promise<void> {
  const user = await requirePlatformSuperAdmin();
  await assertRateLimit({
    key: `template-test:${user.id}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  const templateKey = String(
    formData.get("templateKey"),
  ) as TransactionalEmailTemplateKey;
  const to = String(formData.get("to") || "").trim();

  await sendTransactionalEmail({
    templateKey,
    to,
    userId: user.id,
    isTestSend: true,
    variables: {
      firstName: "Test",
      workspaceName: "Test Workspace",
      verificationUrl: "https://example.test/verify?token=test-placeholder",
      resetUrl: "https://example.test/reset?token=test-placeholder",
      invitationUrl: "https://example.test/invite?token=test-placeholder",
      inviterName: "Test Inviter",
      invitedEmail: to,
      expirationTime: "1 hour",
    },
  });

  revalidatePath("/platform/email-templates");
}
