import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { toEmailTransportBody } from "@/lib/email-generation/email-body";
import { getMicrosoftMailboxConfig } from "@/lib/mailbox/microsoft-config";
import {
  getMicrosoftAccessToken,
  MailboxConnectionError,
} from "@/lib/mailbox/microsoft-oauth";
import type {
  ConnectedEmailProvider,
  ConnectedEmailSendInput,
  ConnectedEmailSendResult,
} from "@/lib/mailbox/provider";

type GraphError = {
  code: string | null;
  message: string | null;
};

function graphError(value: unknown): GraphError {
  if (!value || typeof value !== "object") {
    return { code: null, message: null };
  }
  const outer = value as Record<string, unknown>;
  if (!outer.error || typeof outer.error !== "object") {
    return { code: null, message: null };
  }
  const error = outer.error as Record<string, unknown>;
  return {
    code: typeof error.code === "string" ? error.code : null,
    message:
      typeof error.message === "string" ? error.message.slice(0, 500) : null,
  };
}

async function requireReconnect(input: ConnectedEmailSendInput, code: string) {
  await prisma.mailboxConnection.updateMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      provider: "MICROSOFT_365",
    },
    data: { status: "RECONNECT_REQUIRED", lastErrorCode: code },
  });
}

function graphFailure(
  status: number,
  error: GraphError,
  retryAfter: string | null,
): MailboxConnectionError {
  const combined = `${error.code ?? ""} ${error.message ?? ""}`;
  if (
    status === 401 ||
    /InvalidAuthenticationToken|ErrorInvalidToken|token.*expired/i.test(
      combined,
    )
  ) {
    return new MailboxConnectionError(
      "RECONNECT_REQUIRED",
      "Microsoft rejected the mailbox connection. Reconnect and try again.",
      "RECONNECT",
      error.message,
    );
  }
  if (/admin.*consent|Authorization_RequestDenied|AADSTS65001/i.test(combined)) {
    return new MailboxConnectionError(
      "ADMIN_CONSENT_REQUIRED",
      "Your Microsoft tenant administrator must approve the Mail.Send permission.",
      "ASK_ADMIN",
      error.message,
    );
  }
  if (status === 429) {
    return new MailboxConnectionError(
      "MICROSOFT_THROTTLED",
      retryAfter
        ? `Microsoft is throttling sends. Wait ${retryAfter} seconds and try again.`
        : "Microsoft is throttling sends. Wait briefly and try again.",
      "WAIT_RETRY",
      error.message,
    );
  }
  if (status === 400 || /InvalidRecipient|ErrorInvalidRecipients/i.test(combined)) {
    return new MailboxConnectionError(
      "SEND_REJECTED",
      error.message
        ? `Microsoft rejected the message: ${error.message}`
        : "Microsoft rejected the recipient or message. Review the draft and try again.",
      "EDIT_DRAFT",
      error.message,
    );
  }
  return new MailboxConnectionError(
    "SEND_REJECTED",
    error.message
      ? `Microsoft rejected the send: ${error.message}`
      : "Microsoft could not accept the message. The draft was kept unchanged.",
    status >= 500 ? "RETRY" : "EDIT_DRAFT",
    error.message,
  );
}

async function sendMicrosoftGraph(
  input: ConnectedEmailSendInput,
): Promise<ConnectedEmailSendResult> {
  const auth = await getMicrosoftAccessToken(input);
  const config = getMicrosoftMailboxConfig();
  const clientRequestId = randomUUID();
  const response = await fetch(`${config.graphBaseUrl}/me/sendMail`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "content-type": "application/json",
      "client-request-id": clientRequestId,
      "return-client-request-id": "true",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: "Text",
          content: toEmailTransportBody(input.body),
        },
        toRecipients: [
          { emailAddress: { address: input.to } },
        ],
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
  });
  if (response.status !== 202) {
    const raw: unknown = await response.json().catch(() => null);
    const error = graphFailure(
      response.status,
      graphError(raw),
      response.headers.get("retry-after"),
    );
    if (error.recovery === "RECONNECT") {
      await requireReconnect(input, error.code);
    }
    throw error;
  }
  const dateHeader = response.headers.get("date");
  const acceptedAt = dateHeader ? new Date(dateHeader) : null;
  if (!acceptedAt || Number.isNaN(acceptedAt.getTime())) {
    throw new MailboxConnectionError(
      "MISSING_PROVIDER_TIMESTAMP",
      "Microsoft accepted the message but did not return a valid response timestamp. Contact support before retrying.",
      "CONTACT_SUPPORT",
    );
  }
  return {
    provider: "MICROSOFT_365",
    acceptedAt,
    providerMessageId: null,
    providerRequestId:
      response.headers.get("request-id") ??
      response.headers.get("client-request-id") ??
      clientRequestId,
  };
}

export const microsoftGraphEmailProvider: ConnectedEmailProvider = {
  id: "MICROSOFT_365",
  send: sendMicrosoftGraph,
};
