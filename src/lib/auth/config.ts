import "server-only";

export type AuthEnv = {
  secret: string;
  baseUrl: string;
  appUrl: string;
  isProduction: boolean;
  allowDevTenantBypass: boolean;
  devOrganizationId: string | null;
  devUserId: string | null;
};

/**
 * Central auth/app URL configuration.
 * Fails closed in production if required secrets are missing.
 */
export function getAuthEnv(): AuthEnv {
  const isProduction = process.env.NODE_ENV === "production";
  const secret =
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "";
  const baseUrl =
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";
  const appUrl = process.env.APP_URL?.trim() || baseUrl;

  if (isProduction && secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET (or AUTH_SECRET) must be set to a strong secret (≥32 chars) in production.",
    );
  }

  const allowDevTenantBypass =
    process.env.ALLOW_DEV_TENANT_BYPASS?.trim() === "true";

  if (isProduction && allowDevTenantBypass) {
    throw new Error(
      "ALLOW_DEV_TENANT_BYPASS must not be enabled in production.",
    );
  }

  return {
    secret: secret || "dev-only-insecure-secret-change-me-32chars",
    baseUrl,
    appUrl,
    isProduction,
    allowDevTenantBypass,
    devOrganizationId: process.env.DEV_ORGANIZATION_ID?.trim() || null,
    devUserId: process.env.DEV_USER_ID?.trim() || null,
  };
}

/** True only in non-production with explicit opt-in (or Vitest). Never in production. */
export function isDevTenantBypassEnabled(): boolean {
  const env = getAuthEnv();
  if (env.isProduction) return false;
  if (env.allowDevTenantBypass) return true;
  // Vitest sets NODE_ENV=test; allow DEV_ORGANIZATION_ID for existing tenant tests.
  if (process.env.NODE_ENV === "test" && env.devOrganizationId) return true;
  return false;
}
