import type {
  SendTransactionalMessageInput,
  SendTransactionalMessageResult,
  TransactionalEmailProvider,
} from "@/lib/transactional-email/providers/types";

export class ConsoleTransactionalEmailProvider
  implements TransactionalEmailProvider
{
  readonly name = "console" as const;

  async send(
    input: SendTransactionalMessageInput,
  ): Promise<SendTransactionalMessageResult> {
    // Never log full bodies containing live tokens.
    console.info("[transactional-email:console]", {
      to: input.to,
      subject: input.subject,
      textLength: input.text.length,
      htmlLength: input.html.length,
    });
    return { providerMessageId: `console_${Date.now()}` };
  }

  async verify(): Promise<void> {
    // Always healthy for local zero-delivery mode.
  }
}
