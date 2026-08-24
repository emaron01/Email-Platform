import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  decryptMailboxSecret,
  encryptMailboxSecret,
  mailboxSecretAad,
} from "@/lib/mailbox/crypto";
import {
  getMicrosoftMailboxConfig,
  MICROSOFT_MAIL_SCOPES,
} from "@/lib/mailbox/microsoft-config";
import { TenantError } from "@/lib/tenant/errors";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;
const microsoftJwks = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
);

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().default(""),
  id_token: z.string().min(1).optional(),
});

export type MailboxRecovery =
  | "RECONNECT"
  | "ASK_ADMIN"
  | "EDIT_DRAFT"
  | "RETRY"
  | "WAIT_RETRY"
  | "CONTACT_SUPPORT";

export class MailboxConnectionError extends Error {
  readonly code: string;
  readonly recovery: MailboxRecovery;
  readonly providerReason: string | null;

  constructor(
    code: string,
    message: string,
    recovery: MailboxRecovery,
    providerReason?: string | null,
  ) {
    super(message);
    this.name = "MailboxConnectionError";
    this.code = code;
    this.recovery = recovery;
    this.providerReason = providerReason ?? null;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function safeReturnPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/settings/email";
}

function tokenError(value: unknown): {
  error: string | null;
  description: string | null;
  suberror: string | null;
} {
  if (!value || typeof value !== "object") {
    return { error: null, description: null, suberror: null };
  }
  const row = value as Record<string, unknown>;
  return {
    error: typeof row.error === "string" ? row.error : null,
    description:
      typeof row.error_description === "string"
        ? row.error_description
        : null,
    suberror: typeof row.suberror === "string" ? row.suberror : null,
  };
}

function oauthFailure(error: ReturnType<typeof tokenError>): MailboxConnectionError {
  const combined = `${error.error ?? ""} ${error.description ?? ""} ${error.suberror ?? ""}`;
  if (/admin|consent_required|aadsts65001|aadsts90094/i.test(combined)) {
    return new MailboxConnectionError(
      "ADMIN_CONSENT_REQUIRED",
      "Your Microsoft tenant requires administrator consent for this connection.",
      "ASK_ADMIN",
      error.description,
    );
  }
  if (/invalid_grant|interaction_required|consent|revoked/i.test(combined)) {
    return new MailboxConnectionError(
      "RECONNECT_REQUIRED",
      "Your Microsoft connection is no longer valid. Reconnect your mailbox.",
      "RECONNECT",
      error.description,
    );
  }
  return new MailboxConnectionError(
    "MICROSOFT_TOKEN_ERROR",
    "Microsoft could not complete the mailbox connection. Try again.",
    "RETRY",
    error.description,
  );
}

async function postToken(
  body: URLSearchParams,
): Promise<z.infer<typeof tokenResponseSchema>> {
  const config = getMicrosoftMailboxConfig();
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) throw oauthFailure(tokenError(raw));
  return tokenResponseSchema.parse(raw);
}

function pkceAad(organizationId: string, userId: string): string {
  return mailboxSecretAad({
    organizationId,
    userId,
    provider: "MICROSOFT_365",
    purpose: "pkce",
  });
}

export async function beginMicrosoftMailboxConnection(input: {
  organizationId: string;
  userId: string;
  returnPath?: string | null;
}): Promise<string> {
  const config = getMicrosoftMailboxConfig();
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = sha256(verifier);
  await prisma.$transaction([
    prisma.mailboxOAuthState.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: new Date() } },
          {
            organizationId: input.organizationId,
            userId: input.userId,
            provider: "MICROSOFT_365",
          },
        ],
      },
    }),
    prisma.mailboxOAuthState.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        provider: "MICROSOFT_365",
        stateHash: sha256(state),
        nonceHash: sha256(nonce),
        encryptedCodeVerifier: encryptMailboxSecret(
          verifier,
          pkceAad(input.organizationId, input.userId),
        ),
        returnPath: safeReturnPath(input.returnPath),
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      },
    }),
  ]);

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_MAIL_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function verifiedIdentity(
  idToken: string,
  expectedNonceHash: string,
): Promise<{
  tenantId: string;
  accountId: string;
  mailboxAddress: string;
}> {
  const unverified = decodeJwt(idToken);
  const tenantId = typeof unverified.tid === "string" ? unverified.tid : "";
  if (!tenantId) {
    throw new MailboxConnectionError(
      "INVALID_IDENTITY",
      "Microsoft did not return an organization tenant identity.",
      "RECONNECT",
    );
  }
  const config = getMicrosoftMailboxConfig();
  const verified = await jwtVerify(idToken, microsoftJwks, {
    audience: config.clientId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  });
  if (
    typeof verified.payload.nonce !== "string" ||
    sha256(verified.payload.nonce) !== expectedNonceHash
  ) {
    throw new MailboxConnectionError(
      "INVALID_OAUTH_NONCE",
      "Microsoft connection validation failed. Start the connection again.",
      "RECONNECT",
    );
  }
  const accountId =
    stringClaim(verified.payload, "oid") ?? stringClaim(verified.payload, "sub");
  const mailboxAddress =
    stringClaim(verified.payload, "email") ??
    stringClaim(verified.payload, "preferred_username");
  if (!accountId || !mailboxAddress) {
    throw new MailboxConnectionError(
      "MISSING_MAILBOX_IDENTITY",
      "Microsoft did not return a mailbox address for this account.",
      "RECONNECT",
    );
  }
  return { tenantId, accountId, mailboxAddress };
}

function stringClaim(payload: JWTPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function completeMicrosoftMailboxConnection(input: {
  organizationId: string;
  userId: string;
  state: string;
  code: string;
}): Promise<{ mailboxAddress: string; returnPath: string }> {
  const stateHash = sha256(input.state);
  const stored = await prisma.mailboxOAuthState.findUnique({
    where: { stateHash },
  });
  if (
    !stored ||
    stored.organizationId !== input.organizationId ||
    stored.userId !== input.userId ||
    stored.provider !== "MICROSOFT_365" ||
    stored.expiresAt <= new Date()
  ) {
    throw new MailboxConnectionError(
      "INVALID_OAUTH_STATE",
      "The Microsoft connection request expired or does not match this user.",
      "RECONNECT",
    );
  }
  await prisma.mailboxOAuthState.delete({ where: { id: stored.id } });

  const config = getMicrosoftMailboxConfig();
  const verifier = decryptMailboxSecret(
    stored.encryptedCodeVerifier,
    pkceAad(input.organizationId, input.userId),
  );
  const token = await postToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
      scope: MICROSOFT_MAIL_SCOPES.join(" "),
    }),
  );
  if (!token.id_token || !token.refresh_token) {
    throw new MailboxConnectionError(
      "MISSING_OAUTH_TOKEN",
      "Microsoft did not return the tokens required for a durable connection.",
      "RECONNECT",
    );
  }
  const identity = await verifiedIdentity(token.id_token, stored.nonceHash);
  const accessAad = mailboxSecretAad({
    organizationId: input.organizationId,
    userId: input.userId,
    provider: "MICROSOFT_365",
    purpose: "access",
  });
  const refreshAad = mailboxSecretAad({
    organizationId: input.organizationId,
    userId: input.userId,
    provider: "MICROSOFT_365",
    purpose: "refresh",
  });
  await prisma.mailboxConnection.upsert({
    where: {
      organizationId_userId_provider: {
        organizationId: input.organizationId,
        userId: input.userId,
        provider: "MICROSOFT_365",
      },
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      provider: "MICROSOFT_365",
      mailboxAddress: identity.mailboxAddress,
      providerTenantId: identity.tenantId,
      providerAccountId: identity.accountId,
      encryptedAccessToken: encryptMailboxSecret(
        token.access_token,
        accessAad,
      ),
      encryptedRefreshToken: encryptMailboxSecret(
        token.refresh_token,
        refreshAad,
      ),
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      grantedScopesJson: token.scope.split(/\s+/).filter(Boolean),
      status: "CONNECTED",
      lastErrorCode: null,
    },
    update: {
      mailboxAddress: identity.mailboxAddress,
      providerTenantId: identity.tenantId,
      providerAccountId: identity.accountId,
      encryptedAccessToken: encryptMailboxSecret(
        token.access_token,
        accessAad,
      ),
      encryptedRefreshToken: encryptMailboxSecret(
        token.refresh_token,
        refreshAad,
      ),
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      grantedScopesJson: token.scope.split(/\s+/).filter(Boolean),
      status: "CONNECTED",
      lastErrorCode: null,
      connectedAt: new Date(),
      refreshedAt: null,
    },
  });
  return {
    mailboxAddress: identity.mailboxAddress,
    returnPath: safeReturnPath(stored.returnPath),
  };
}

export async function getMicrosoftAccessToken(input: {
  organizationId: string;
  userId: string;
}): Promise<{ accessToken: string; mailboxAddress: string }> {
  const connection = await prisma.mailboxConnection.findUnique({
    where: {
      organizationId_userId_provider: {
        organizationId: input.organizationId,
        userId: input.userId,
        provider: "MICROSOFT_365",
      },
    },
  });
  if (!connection || connection.status !== "CONNECTED") {
    throw new MailboxConnectionError(
      "RECONNECT_REQUIRED",
      "Connect your Microsoft 365 mailbox before sending.",
      "RECONNECT",
    );
  }
  const accessAad = mailboxSecretAad({
    organizationId: input.organizationId,
    userId: input.userId,
    provider: "MICROSOFT_365",
    purpose: "access",
  });
  if (
    connection.accessTokenExpiresAt.getTime() >
    Date.now() + TOKEN_EXPIRY_SKEW_MS
  ) {
    return {
      accessToken: decryptMailboxSecret(
        connection.encryptedAccessToken,
        accessAad,
      ),
      mailboxAddress: connection.mailboxAddress,
    };
  }

  const refreshAad = mailboxSecretAad({
    organizationId: input.organizationId,
    userId: input.userId,
    provider: "MICROSOFT_365",
    purpose: "refresh",
  });
  let token: z.infer<typeof tokenResponseSchema>;
  try {
    const config = getMicrosoftMailboxConfig();
    token = await postToken(
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: decryptMailboxSecret(
          connection.encryptedRefreshToken,
          refreshAad,
        ),
        redirect_uri: config.redirectUri,
        scope: MICROSOFT_MAIL_SCOPES.join(" "),
      }),
    );
  } catch (error) {
    if (
      error instanceof MailboxConnectionError &&
      error.recovery === "RECONNECT"
    ) {
      await prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          status: "RECONNECT_REQUIRED",
          lastErrorCode: error.code,
        },
      });
    }
    throw error;
  }
  const refreshToken = token.refresh_token
    ? encryptMailboxSecret(token.refresh_token, refreshAad)
    : connection.encryptedRefreshToken;
  await prisma.mailboxConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptMailboxSecret(
        token.access_token,
        accessAad,
      ),
      encryptedRefreshToken: refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      grantedScopesJson: token.scope.split(/\s+/).filter(Boolean),
      status: "CONNECTED",
      lastErrorCode: null,
      refreshedAt: new Date(),
    },
  });
  return {
    accessToken: token.access_token,
    mailboxAddress: connection.mailboxAddress,
  };
}

export async function disconnectMicrosoftMailbox(input: {
  organizationId: string;
  userId: string;
}): Promise<void> {
  await prisma.mailboxConnection.deleteMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      provider: "MICROSOFT_365",
    },
  });
}
