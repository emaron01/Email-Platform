import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { toEmailTransportBody } from "@/lib/email-generation/email-body";
import {
  getMicrosoftMailboxConfig,
  grantedScopesIncludeMailSend,
} from "@/lib/mailbox/microsoft-config";
import {
  classifyMailboxConnectionFailure,
  getMicrosoftAccessToken,
  logMailboxConnectionFailure,
  MailboxConnectionError,
  type MailboxOAuthStage,
} from "@/lib/mailbox/microsoft-oauth";
import type {
  ConnectedEmailProvider,
  ConnectedEmailSendInput,
  ConnectedEmailSendResult,
} from "@/lib/mailbox/provider";

export type GraphError = {
  code: string | null;
  message: string | null;
};

/**
 * Parse Graph or OAuth-style error JSON.
 * Graph: { error: { code, message } }
 * OAuth: { error: "invalid_token", error_description: "..." }
 */
export function parseMicrosoftGraphErrorBody(value: unknown): GraphError {
  if (!value || typeof value !== "object") {
    return { code: null, message: null };
  }
  const outer = value as Record<string, unknown>;
  const nested = outer.error;

  if (nested && typeof nested === "object") {
    const error = nested as Record<string, unknown>;
    return {
      code: typeof error.code === "string" ? error.code : null,
      message:
        typeof error.message === "string" ? error.message.slice(0, 500) : null,
    };
  }

  if (typeof nested === "string") {
    const description =
      typeof outer.error_description === "string"
        ? outer.error_description.slice(0, 500)
        : typeof outer.message === "string"
          ? outer.message.slice(0, 500)
          : null;
    return { code: nested, message: description };
  }

  return {
    code: typeof outer.code === "string" ? outer.code : null,
    message:
      typeof outer.message === "string" ? outer.message.slice(0, 500) : null,
  };
}

/** Always produce a diagnosable reason — never null when we have status/headers/body. */
export function formatGraphProviderReason(input: {
  status: number;
  error: GraphError;
  wwwAuthenticate: string | null;
  bodySnippet: string | null;
}): string {
  const parts: string[] = [`http=${input.status}`];
  if (input.error.code) parts.push(`code=${input.error.code}`);
  if (input.error.message) parts.push(`message=${input.error.message}`);
  if (input.wwwAuthenticate) {
    parts.push(`www-authenticate=${input.wwwAuthenticate.slice(0, 300)}`);
  }
  if (
    !input.error.code &&
    !input.error.message &&
    input.bodySnippet?.trim()
  ) {
    parts.push(`body=${input.bodySnippet.trim().slice(0, 300)}`);
  }
  return parts.join("; ").slice(0, 500);
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

function logSendFailure(
  error: unknown,
  fallbackStage: MailboxOAuthStage,
  context?: {
    tokenSource?: "stored" | "refreshed";
    tokenAgeMs?: number;
    graphRequestId?: string | null;
  },
) {
  const classified = classifyMailboxConnectionFailure(error);
  const extra: Record<string, unknown> = {};
  if (context?.tokenSource !== undefined) extra.tokenSource = context.tokenSource;
  if (context?.tokenAgeMs !== undefined) extra.tokenAgeMs = context.tokenAgeMs;
  if (context?.graphRequestId) extra.graphRequestId = context.graphRequestId;
  logMailboxConnectionFailure({
    event: "mailbox_microsoft_send_failed",
    stage: classified.stage !== "unknown" ? classified.stage : fallbackStage,
    code: classified.code,
    recovery: classified.recovery,
    providerReasonSafe: classified.providerReasonSafe,
    messageSafe: classified.messageSafe,
    ...extra,
  });
}

export async function assertMailboxHasMailSendScope(
  input: ConnectedEmailSendInput,
): Promise<void> {
  const connection = await prisma.mailboxConnection.findUnique({
    where: {
      organizationId_userId_provider: {
        organizationId: input.organizationId,
        userId: input.userId,
        provider: "MICROSOFT_365",
      },
    },
    select: { status: true, grantedScopesJson: true },
  });
  if (!connection || connection.status !== "CONNECTED") {
    throw new MailboxConnectionError(
      "RECONNECT_REQUIRED",
      "Connect your Microsoft 365 mailbox before sending.",
      "RECONNECT",
      null,
      "get_access_token",
    );
  }
  if (!grantedScopesIncludeMailSend(connection.grantedScopesJson)) {
    await requireReconnect(input, "MISSING_MAIL_SEND_SCOPE");
    const error = new MailboxConnectionError(
      "MISSING_MAIL_SEND_SCOPE",
      "This mailbox connection does not include sending permission. Reconnect Microsoft 365 and grant Mail.Send when prompted.",
      "RECONNECT",
      Array.isArray(connection.grantedScopesJson)
        ? `granted=${connection.grantedScopesJson.map(String).join(" ")}`.slice(
            0,
            400,
          )
        : "granted=(none)",
      "graph_sendMail",
    );
    logSendFailure(error, "graph_sendMail");
    throw error;
  }
}

function graphFailure(
  status: number,
  error: GraphError,
  retryAfter: string | null,
  stage: MailboxOAuthStage,
  providerReason: string,
): MailboxConnectionError {
  const combined = `${error.code ?? ""} ${error.message ?? ""} ${providerReason}`;
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
      providerReason,
      stage,
    );
  }
  if (/admin.*consent|Authorization_RequestDenied|AADSTS65001/i.test(combined)) {
    return new MailboxConnectionError(
      "ADMIN_CONSENT_REQUIRED",
      "Your Microsoft tenant administrator must approve the Mail.Send permission.",
      "ASK_ADMIN",
      providerReason,
      stage,
    );
  }
  if (status === 429) {
    return new MailboxConnectionError(
      "MICROSOFT_THROTTLED",
      retryAfter
        ? `Microsoft is throttling sends. Wait ${retryAfter} seconds and try again.`
        : "Microsoft is throttling sends. Wait briefly and try again.",
      "WAIT_RETRY",
      providerReason,
      stage,
    );
  }
  if (status === 400 || /InvalidRecipient|ErrorInvalidRecipients/i.test(combined)) {
    return new MailboxConnectionError(
      "SEND_REJECTED",
      error.message
        ? `Microsoft rejected the message: ${error.message}`
        : "Microsoft rejected the recipient or message. Review the draft and try again.",
      "EDIT_DRAFT",
      providerReason,
      stage,
    );
  }
  return new MailboxConnectionError(
    "SEND_REJECTED",
    error.message
      ? `Microsoft rejected the send: ${error.message}`
      : "Microsoft could not accept the message. The draft was kept unchanged.",
    status >= 500 ? "RETRY" : "EDIT_DRAFT",
    providerReason,
    stage,
  );
}

function withStage(
  error: MailboxConnectionError,
  stage: MailboxOAuthStage,
): MailboxConnectionError {
  if (error.stage) return error;
  return new MailboxConnectionError(
    error.code,
    error.message,
    error.recovery,
    error.providerReason,
    stage,
  );
}

async function sendMicrosoftGraph(
  input: ConnectedEmailSendInput,
): Promise<ConnectedEmailSendResult> {
  let stage: MailboxOAuthStage = "get_access_token";
  let tokenContext:
    | { tokenSource: "stored" | "refreshed"; tokenAgeMs: number }
    | undefined;
  try {
    await assertMailboxHasMailSendScope(input);
    const auth = await getMicrosoftAccessToken(input);
    tokenContext = {
      tokenSource: auth.tokenSource,
      // Positive = still valid; negative = already expired (should not reach Graph).
      tokenAgeMs: auth.tokenExpiresAt.getTime() - Date.now(),
    };
    stage = "graph_sendMail";
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
    const graphRequestId =
      response.headers.get("request-id") ??
      response.headers.get("client-request-id") ??
      clientRequestId;
    if (response.status !== 202) {
      const bodyText = await response.text().catch(() => "");
      let raw: unknown = null;
      if (bodyText.trim()) {
        try {
          raw = JSON.parse(bodyText) as unknown;
        } catch {
          raw = null;
        }
      }
      const parsed = parseMicrosoftGraphErrorBody(raw);
      const providerReason = formatGraphProviderReason({
        status: response.status,
        error: parsed,
        wwwAuthenticate: response.headers.get("www-authenticate"),
        bodySnippet: bodyText || null,
      });
      const error = graphFailure(
        response.status,
        parsed,
        response.headers.get("retry-after"),
        "graph_sendMail",
        providerReason,
      );
      if (error.recovery === "RECONNECT") {
        await requireReconnect(input, error.code);
      }
      logSendFailure(error, "graph_sendMail", { ...tokenContext, graphRequestId });
      throw error;
    }
    const dateHeader = response.headers.get("date");
    const acceptedAt = dateHeader ? new Date(dateHeader) : null;
    if (!acceptedAt || Number.isNaN(acceptedAt.getTime())) {
      const error = new MailboxConnectionError(
        "MISSING_PROVIDER_TIMESTAMP",
        "Microsoft accepted the message but did not return a valid response timestamp. Contact support before retrying.",
        "CONTACT_SUPPORT",
        null,
        "graph_sendMail",
      );
      logSendFailure(error, "graph_sendMail", tokenContext);
      throw error;
    }
    return {
      provider: "MICROSOFT_365",
      acceptedAt,
      providerMessageId: null,
      providerRequestId: graphRequestId,
    };
  } catch (error) {
    if (
      error instanceof MailboxConnectionError &&
      error.stage === "graph_sendMail"
    ) {
      // Already logged for Graph response / timestamp / scope failures.
      throw error;
    }
    const tagged =
      error instanceof MailboxConnectionError
        ? withStage(error, stage)
        : error;
    if (
      tagged instanceof MailboxConnectionError &&
      tagged.recovery === "RECONNECT"
    ) {
      await requireReconnect(input, tagged.code);
    }
    logSendFailure(tagged, stage, tokenContext);
    throw tagged;
  }
}

export const microsoftGraphEmailProvider: ConnectedEmailProvider = {
  id: "MICROSOFT_365",
  send: sendMicrosoftGraph,
};
