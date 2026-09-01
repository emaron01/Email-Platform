import {
  formatFromAddress,
  getTransactionalEmailConfig,
} from "@/lib/transactional-email/config-core";
import { ConsoleTransactionalEmailProvider } from "@/lib/transactional-email/providers/console";
import { ResendTransactionalEmailProvider } from "@/lib/transactional-email/providers/resend";
import { SmtpTransactionalEmailProvider } from "@/lib/transactional-email/providers/smtp";
import type { TransactionalEmailProvider } from "@/lib/transactional-email/providers/types";
import {
  assertLiveTransactionalEmailBlockedInTests,
  isTransactionalEmailTestRuntime,
} from "@/lib/transactional-email/test-runtime";

export function getTransactionalEmailProvider(): TransactionalEmailProvider {
  if (isTransactionalEmailTestRuntime()) {
    return new ConsoleTransactionalEmailProvider();
  }

  const config = getTransactionalEmailConfig();
  const from = formatFromAddress(config);

  if (config.provider === "resend") {
    if (!config.apiKey) {
      throw new Error("Resend API key missing.");
    }
    assertLiveTransactionalEmailBlockedInTests({
      phase: "construct",
      provider: "resend",
    });
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
    assertLiveTransactionalEmailBlockedInTests({
      phase: "construct",
      provider: "smtp",
    });
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
