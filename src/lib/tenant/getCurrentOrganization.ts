import "server-only";

import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  requireCurrentUser,
  resolveActiveOrganization,
} from "@/lib/auth/session";
import { isDevTenantBypassEnabled, getAuthEnv } from "@/lib/auth/config";
import { TenantError } from "@/lib/tenant/errors";

export { TenantError };

/**
 * Resolves the active Organization for the current request.
 *
 * Production: authenticated User → OrganizationMembership → active org.
 * Local dev only: optional DEV_ORGANIZATION_ID when ALLOW_DEV_TENANT_BYPASS=true.
 * DEV bypass is impossible in production (enforced in getAuthEnv).
 */
export async function getCurrentOrganization(): Promise<Organization | null> {
  if (isDevTenantBypassEnabled()) {
    const env = getAuthEnv();
    if (env.devOrganizationId) {
      return prisma.organization.findFirst({
        where: { id: env.devOrganizationId, status: "ACTIVE" },
      });
    }
  }

  const user = await getCurrentUser();
  if (!user) return null;
  const ctx = await resolveActiveOrganization(user);
  return ctx?.organization ?? null;
}

export async function requireOrganization(): Promise<Organization> {
  const organization = await getCurrentOrganization();
  if (!organization) {
    throw new TenantError(
      "No active organization. Sign in and ensure you belong to a workspace.",
    );
  }
  if (organization.status === "SUSPENDED") {
    throw new TenantError(
      "This workspace is suspended. Contact support if you need help.",
    );
  }
  if (organization.status === "CANCELLED") {
    throw new TenantError("This workspace is no longer available.");
  }
  return organization;
}

export async function requireOrganizationId(): Promise<string> {
  const organization = await requireOrganization();
  return organization.id;
}

/**
 * Reject client-supplied organization IDs that the user does not belong to.
 */
export async function requireMembershipInOrganization(
  organizationId: string,
): Promise<Organization> {
  const user = await requireCurrentUser();
  const ctx = await resolveActiveOrganization(user, organizationId);
  if (!ctx) {
    throw new TenantError("Organization not found for this account.");
  }
  if (ctx.organization.status !== "ACTIVE") {
    throw new TenantError(
      "This workspace is not available for normal operations.",
    );
  }
  return ctx.organization;
}
