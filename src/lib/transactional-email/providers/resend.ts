import type {
  SendTransactionalMessageInput,
  SendTransactionalMessageResult,
  TransactionalEmailProvider,
} from "@/lib/transactional-email/providers/types";
import { TransactionalEmailSendError } from "@/lib/transactional-email/providers/types";
import { assertLiveTransactionalEmailBlockedInTests } from "@/lib/transactional-email/test-runtime";

export class ResendTransactionalEmailProvider
  implements TransactionalEmailProvider
{
  readonly name = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | null,
  ) {}

  async send(
    input: SendTransactionalMessageInput,
  ): Promise<SendTransactionalMessageResult> {
    assertLiveTransactionalEmailBlockedInTests({
      phase: "send",
      provider: "resend",
      recipient: input.to,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      throw new TransactionalEmailSendError(
        `Resend failed (${res.status}): ${body.slice(0, 300)}`,
        retryable ? "TRANSIENT" : "PROVIDER_ERROR",
        retryable,
      );
    }

    const data = (await res.json()) as { id?: string };
    return { providerMessageId: data.id ?? null };
  }
}
