import {
  formatFromAddress,
  getTransactionalEmailConfig,
} from "@/lib/transactional-email/config";
import { ConsoleTransactionalEmailProvider } from "@/lib/transactional-email/providers/console";
import { ResendTransactionalEmailProvider } from "@/lib/transactional-email/providers/resend";
import { SmtpTransactionalEmailProvider } from "@/lib/transactional-email/providers/smtp";
import type { TransactionalEmailProvider } from "@/lib/transactional-email/providers/types";

export function getTransactionalEmailProvider(): TransactionalEmailProvider {
  const config = getTransactionalEmailConfig();
  const from = formatFromAddress(config);

  if (config.provider === "resend") {
    if (!config.apiKey) {
      throw new Error("Resend API key missing.");
    }
    return new ResendTransactionalEmailProvider(
      config.apiKey,
      from,
      config.replyTo,
    );
  }

  if (config.provider === "smtp") {
    if (!config.smtp) {
      throw new Error("SMTP configuration missing.");
    }
    return new SmtpTransactionalEmailProvider(
      config.smtp,
      from,
      config.replyTo,
      config.fromEmail,
    );
  }

  return new ConsoleTransactionalEmailProvider();
}

export type { TransactionalEmailProvider } from "@/lib/transactional-email/providers/types";
export {
  TransactionalEmailSendError,
  assertSafeRecipient,
  assertSafeSubject,
} from "@/lib/transactional-email/providers/types";
