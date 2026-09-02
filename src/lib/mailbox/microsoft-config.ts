import "server-only";

export const MICROSOFT_MAIL_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/Mail.Send",
] as const;

/** Default matches multi-tenant + personal Microsoft account app registrations. */
export const MICROSOFT_AUTHORITY_TENANT_DEFAULT = "common";

export type MicrosoftMailboxConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Authority tenant segment: common | organizations | consumers | {tenant-guid}. */
  authorityTenant: string;
  authorizeUrl: string;
  tokenUrl: string;
  graphBaseUrl: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

/**
 * Public app origin for redirects. Never use request.url on Render —
 * that resolves to the internal listen host (e.g. localhost:10000).
 */
export function getAppBaseUrl(): string {
  const appUrl = (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
  if (!appUrl) {
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required.");
  }
  return appUrl;
}

/** Absolute URL on the configured public app origin. */
export function appAbsoluteUrl(path: string): string {
  const base = getAppBaseUrl();
  if (!path.startsWith("/")) {
    throw new Error("appAbsoluteUrl requires a path starting with /.");
  }
  return new URL(path, `${base}/`).toString();
}

const GUID_TENANT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Microsoft identity platform authority tenant segment.
 * Env: MICROSOFT_AUTHORITY_TENANT (default: common).
 * Allowed: common | organizations | consumers | a tenant GUID.
 */
export function resolveMicrosoftAuthorityTenant(
  raw: string | undefined | null = process.env.MICROSOFT_AUTHORITY_TENANT,
): string {
  const trimmed = (raw ?? "").trim().toLowerCase();
  const value = trimmed || MICROSOFT_AUTHORITY_TENANT_DEFAULT;
  if (
    value === "common" ||
    value === "organizations" ||
    value === "consumers" ||
    GUID_TENANT.test(value)
  ) {
    return value;
  }
  throw new Error(
    "MICROSOFT_AUTHORITY_TENANT must be common, organizations, consumers, or a tenant GUID.",
  );
}

export function microsoftAuthorityUrls(authorityTenant: string): {
  authorizeUrl: string;
  tokenUrl: string;
} {
  const base = `https://login.microsoftonline.com/${authorityTenant}/oauth2/v2.0`;
  return {
    authorizeUrl: `${base}/authorize`,
    tokenUrl: `${base}/token`,
  };
}

export function getMicrosoftMailboxConfig(): MicrosoftMailboxConfig {
  const appUrl = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  ).replace(/\/+$/, "");
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI?.trim() ||
    (appUrl ? `${appUrl}/api/mailbox/microsoft/callback` : "");
  if (!redirectUri) {
    throw new Error("MICROSOFT_REDIRECT_URI or APP_URL is required.");
  }
  const authorityTenant = resolveMicrosoftAuthorityTenant();
  const { authorizeUrl, tokenUrl } = microsoftAuthorityUrls(authorityTenant);
  return {
    clientId: required("MICROSOFT_CLIENT_ID"),
    clientSecret: required("MICROSOFT_CLIENT_SECRET"),
    redirectUri,
    authorityTenant,
    authorizeUrl,
    tokenUrl,
    graphBaseUrl: "https://graph.microsoft.com/v1.0",
  };
}
