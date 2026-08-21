import "server-only";

import type { MembershipRole, PlatformRole, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  requireCurrentUser,
  resolveActiveOrganization,
} from "@/lib/auth/session";
import { assertAccountCapability } from "@/lib/auth/account-policy";
import {
  requireOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export { getCurrentUser, requireCurrentUser };

export function canManageOrganizationPolicy(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageInvitations(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canRenameWorkspace(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function isPlatformSuperAdmin(role: PlatformRole): boolean {
  return role === "SUPER_ADMIN";
}

export function canEditTransactionalTemplates(role: PlatformRole): boolean {
  return role === "SUPER_ADMIN";
}

export async function getMembershipForCurrentUser(organizationId?: string) {
  const user = await requireCurrentUser();
  const ctx = await resolveActiveOrganization(user, organizationId);
  if (!ctx) {
    throw new TenantError("Organization not found.");
  }
  // For admin operations, prefer ACTIVE orgs; suspended still resolvable for messaging.
  return ctx;
}

export async function requireOrgAdmin(organizationId?: string) {
  const ctx = await getMembershipForCurrentUser(organizationId);
  if (!canManageOrganizationPolicy(ctx.membership.role)) {
    throw new AuthorizationError(
      "Organization administrator permission required.",
    );
  }
  assertAccountCapability(ctx.user, "CHANGE_ORG_POLICY");
  return ctx;
}

export async function requirePlatformSuperAdmin(): Promise<User> {
  const user = await requireCurrentUser();
  if (!canEditTransactionalTemplates(user.platformRole)) {
    throw new AuthorizationError("Platform super admin required.");
  }
  return user;
}

export async function requireVerifiedForAiSpend(): Promise<User> {
  const user = await requireCurrentUser();
  assertAccountCapability(user, "AI_SPEND");
  await requireOrganization();
  return user;
}
