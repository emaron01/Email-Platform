/**
 * Node-safe transactional email send (no server-only).
 * Next.js entry: `@/lib/transactional-email/send` re-exports behind server-only.
 */
import type { TransactionalEmailTemplateKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTransactionalEmailConfig } from "@/lib/transactional-email/config-core";
import {
  getTransactionalEmailProvider,
  TransactionalEmailSendError,
  assertSafeRecipient,
} from "@/lib/transactional-email/providers";
import {
  renderTransactionalTemplate,
  type RenderedTransactionalEmail,
} from "@/lib/transactional-email/render-service";
import type { TemplateVariableMap } from "@/lib/transactional-email/templates";

export type { TransactionalEmailProvider } from "@/lib/transactional-email/providers";
export { getTransactionalEmailProvider } from "@/lib/transactional-email/providers";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function failureCategoryOf(error: unknown): string {
  if (error instanceof TransactionalEmailSendError) return error.category;
  return "PROVIDER_ERROR";
}

function isRetryable(error: unknown): boolean {
  if (error instanceof TransactionalEmailSendError) return error.retryable;
  return true; // unknown errors: allow bounded retries
}

/**
 * Send a platform transactional email via the configured provider
 * (console | smtp | resend). Uses DB templates unchanged.
 */
export async function sendTransactionalEmail(input: {
  templateKey: TransactionalEmailTemplateKey;
  to: string;
  variables: TemplateVariableMap;
  userId?: string | null;
  organizationId?: string | null;
  idempotencyKey?: string | null;
  /** Test send: still delivers, but tagged and never used for account mutation. */
  isTestSend?: boolean;
  maxRetries?: number;
}): Promise<{ eventId: string; rendered: RenderedTransactionalEmail }> {
  const config = getTransactionalEmailConfig();
  const to = assertSafeRecipient(input.to);

  if (input.idempotencyKey) {
    const existing = await prisma.transactionalEmailEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing && existing.status === "SENT") {
      return {
        eventId: existing.id,
        rendered: {
          templateKey: input.templateKey,
          templateVersion: existing.templateVersion,
          subject: "(idempotent skip)",
          html: "",
          text: "",
          fromBaseline: false,
        },
      };
    }
  }

  const rendered = await renderTransactionalTemplate({
    templateKey: input.templateKey,
    variables: {
      appName: config.fromName,
      supportEmail: config.supportEmail,
      ...input.variables,
    },
  });

  const event = await prisma.transactionalEmailEvent.create({
    data: {
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      templateKey: input.templateKey,
      templateVersion: rendered.templateVersion,
      recipientEmailNormalized: to,
      provider: config.provider,
      status: "QUEUED",
      idempotencyKey: input.idempotencyKey ?? null,
      retryCount: 0,
    },
  });

  const provider = getTransactionalEmailProvider();
  const maxRetries = input.maxRetries ?? 2;
  let lastError: unknown;
  const started = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await provider.send({
        to,
        subject: input.isTestSend
          ? `[TEST] ${rendered.subject}`
          : rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await prisma.transactionalEmailEvent.update({
        where: { id: event.id },
        data: {
          status: "SENT",
          providerMessageId: result.providerMessageId,
          retryCount: attempt,
          sentAt: new Date(),
          failureCategory: null,
        },
      });

      console.info("[transactional-email]", {
        provider: config.provider,
        templateKey: input.templateKey,
        status: "SENT",
        retryCount: attempt,
        durationMs: Date.now() - started,
        isTestSend: Boolean(input.isTestSend),
      });

      return { eventId: event.id, rendered };
    } catch (error) {
      lastError = error;
      const category = failureCategoryOf(error);
      await prisma.transactionalEmailEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          retryCount: attempt,
          failureCategory: category,
        },
      });

      console.error("[transactional-email]", {
        provider: config.provider,
        templateKey: input.templateKey,
        status: "FAILED",
        failureCategory: category,
        retryCount: attempt,
        durationMs: Date.now() - started,
        // Never log passwords, tokens, or full security URLs.
        message:
          error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });

      if (attempt < maxRetries && isRetryable(error)) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Transactional email failed.");
}

/**
 * SUPER_ADMIN / ops diagnostic: verify configured provider connectivity.
 * Never returns or logs credentials.
 */
export async function verifyTransactionalEmailProvider(): Promise<{
  provider: string;
  ok: true;
}> {
  const config = getTransactionalEmailConfig();
  const provider = getTransactionalEmailProvider();
  if (provider.verify) {
    await provider.verify();
  }
  return { provider: config.provider, ok: true };
}
