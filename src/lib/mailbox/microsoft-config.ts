import "server-only";

export const MICROSOFT_MAIL_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/Mail.Send",
] as const;

export type MicrosoftMailboxConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  graphBaseUrl: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
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
  return {
    clientId: required("MICROSOFT_CLIENT_ID"),
    clientSecret: required("MICROSOFT_CLIENT_SECRET"),
    redirectUri,
    authorizeUrl:
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    tokenUrl:
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    graphBaseUrl: "https://graph.microsoft.com/v1.0",
  };
}
