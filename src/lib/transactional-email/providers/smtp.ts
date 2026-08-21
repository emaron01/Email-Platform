import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { SmtpConfig } from "@/lib/transactional-email/config-core";
import {
  assertSafeRecipient,
  assertSafeSubject,
  TransactionalEmailSendError,
  type SendTransactionalMessageInput,
  type SendTransactionalMessageResult,
  type TransactionalEmailProvider,
} from "@/lib/transactional-email/providers/types";

type Transporter = nodemailer.Transporter<SMTPTransport.SentMessageInfo>;

/**
 * Process-local SMTP transport reuse for Next.js/Render.
 * Avoids creating a new connection pool per send.
 */
let sharedTransporter: Transporter | null = null;
let sharedTransporterKey: string | null = null;

function transporterKey(smtp: SmtpConfig, fromEmail: string): string {
  // Never include password in the key string used for logging elsewhere.
  return `${smtp.host}|${smtp.port}|${smtp.secure}|${smtp.user}|${fromEmail}|${smtp.timeoutMs}`;
}

function createTransporter(
  smtp: SmtpConfig,
): Transporter {
  const options: SMTPTransport.Options = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
    // Never disable certificate validation.
    tls: {
      // rejectUnauthorized defaults to true; keep explicit.
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: smtp.timeoutMs,
    greetingTimeout: smtp.timeoutMs,
    socketTimeout: smtp.timeoutMs,
    // Prefer STARTTLS when secure=false (typical port 587).
    requireTLS: !smtp.secure,
  };

  return nodemailer.createTransport(options);
}

function getSharedTransporter(
  smtp: SmtpConfig,
  fromEmail: string,
): Transporter {
  const key = transporterKey(smtp, fromEmail);
  if (!sharedTransporter || sharedTransporterKey !== key) {
    if (sharedTransporter) {
      try {
        sharedTransporter.close();
      } catch {
        // ignore close errors on recycle
      }
    }
    sharedTransporter = createTransporter(smtp);
    sharedTransporterKey = key;
  }
  return sharedTransporter;
}

function classifySmtpError(error: unknown): TransactionalEmailSendError {
  const err = error as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
    command?: string;
  };

  const code = (err.code || "").toUpperCase();
  const responseCode = err.responseCode;
  const message = (err.message || "SMTP send failed").slice(0, 300);

  // Never include credentials in thrown messages.
  const safeMessage = message
    .replace(/pass(word)?[=:]\s*\S+/gi, "password=[redacted]")
    .replace(/auth[^=\s]*[=:]\s*\S+/gi, "auth=[redacted]");

  if (
    code === "EAUTH" ||
    responseCode === 535 ||
    /invalid login|authentication failed/i.test(safeMessage)
  ) {
    return new TransactionalEmailSendError(safeMessage, "AUTH", false);
  }

  if (
    code === "EENVELOPE" ||
    responseCode === 550 ||
    responseCode === 551 ||
    responseCode === 553 ||
    /recipient|mailbox unavailable|user unknown/i.test(safeMessage)
  ) {
    return new TransactionalEmailSendError(safeMessage, "RECIPIENT", false);
  }

  if (
    code === "ECONNECTION" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    (typeof responseCode === "number" &&
      responseCode >= 400 &&
      responseCode < 500)
  ) {
    return new TransactionalEmailSendError(safeMessage, "TRANSIENT", true);
  }

  if (typeof responseCode === "number" && responseCode >= 500) {
    return new TransactionalEmailSendError(safeMessage, "PERMANENT", false);
  }

  return new TransactionalEmailSendError(safeMessage, "PROVIDER_ERROR", false);
}

/**
 * SMTP adapter for platform transactional/account email (e.g. IONOS mailbox).
 * Not for customer prospecting / campaign mailboxes.
 */
export class SmtpTransactionalEmailProvider
  implements TransactionalEmailProvider
{
  readonly name = "smtp" as const;

  constructor(
    private readonly smtp: SmtpConfig,
    private readonly from: string,
    private readonly replyTo: string | null,
    private readonly fromEmail: string,
  ) {}

  async send(
    input: SendTransactionalMessageInput,
  ): Promise<SendTransactionalMessageResult> {
    const to = assertSafeRecipient(input.to);
    const subject = assertSafeSubject(input.subject);
    const transporter = getSharedTransporter(this.smtp, this.fromEmail);

    try {
      const info = await transporter.sendMail({
        from: this.from,
        to,
        subject,
        text: input.text,
        html: input.html,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      });

      const messageId =
        typeof info.messageId === "string" && info.messageId.trim()
          ? info.messageId.trim()
          : null;

      return { providerMessageId: messageId };
    } catch (error) {
      const classified = classifySmtpError(error);
      if (classified.retryable) {
        // Recycle transport after transient disconnects so the next attempt
        // does not reuse a dead socket.
        resetSharedSmtpTransport();
      }
      throw classified;
    }
  }

  async verify(): Promise<void> {
    const transporter = getSharedTransporter(this.smtp, this.fromEmail);
    try {
      await transporter.verify();
    } catch (error) {
      resetSharedSmtpTransport();
      throw classifySmtpError(error);
    }
  }
}

function resetSharedSmtpTransport(): void {
  if (sharedTransporter) {
    try {
      sharedTransporter.close();
    } catch {
      // ignore
    }
  }
  sharedTransporter = null;
  sharedTransporterKey = null;
}

/** Test helper: reset shared transport between tests. */
export function resetSmtpTransportForTests(): void {
  resetSharedSmtpTransport();
}
