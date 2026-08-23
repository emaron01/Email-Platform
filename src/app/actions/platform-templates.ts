"use server";

import { revalidatePath } from "next/cache";
import type { TransactionalEmailTemplateKey } from "@prisma/client";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { assertRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  TemplateRenderError,
  validateTemplateContent,
} from "@/lib/transactional-email/render";
import { sendTransactionalEmail } from "@/lib/transactional-email/send";
import { TransactionalEmailConfigError } from "@/lib/transactional-email/config-core";
import { TransactionalEmailSendError } from "@/lib/transactional-email/providers/types";
import { BASELINE_TEMPLATES } from "@/lib/transactional-email/templates";

export type PlatformTemplateActionResult = { ok: boolean; message: string };

function toSafePlatformTemplateActionError(error: unknown): string {
  if (
    error instanceof AuthorizationError ||
    error instanceof RateLimitError ||
    error instanceof TemplateRenderError ||
    error instanceof TransactionalEmailConfigError ||
    error instanceof TransactionalEmailSendError
  ) {
    return error.message;
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to update template. Please try again.";
    }
    return error.message;
  }
  return "Unable to update template. Please try again.";
}

export async function saveTransactionalTemplateAction(
  _prev: PlatformTemplateActionResult | null,
  formData: FormData,
): Promise<PlatformTemplateActionResult> {
  try {
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
    return { ok: true, message: "Template saved." };
  } catch (error) {
    return { ok: false, message: toSafePlatformTemplateActionError(error) };
  }
}

export async function testSendTransactionalTemplateAction(
  _prev: PlatformTemplateActionResult | null,
  formData: FormData,
): Promise<PlatformTemplateActionResult> {
  try {
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
    return { ok: true, message: "Test email sent." };
  } catch (error) {
    return { ok: false, message: toSafePlatformTemplateActionError(error) };
  }
}
