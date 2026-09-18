import "server-only";

import type { MembershipRole } from "@prisma/client";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { AuthorizationError } from "@/lib/auth/authz";
import { getAuthEnv, isDevTenantBypassEnabled } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";

export type WorkActor = {
  organizationId: string;
  userId: string;
  role: MembershipRole;
  canViewAll: boolean;
};

export function canViewAllRepWork(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canViewOwnedWork(input: {
  role: MembershipRole;
  userId: string;
  ownerUserId: string;
}): boolean {
  return (
    input.ownerUserId === input.userId || canViewAllRepWork(input.role)
  );
}

export function canModifyOwnedWork(input: {
  userId: string;
  ownerUserId: string;
}): boolean {
  return input.ownerUserId === input.userId;
}

export async function getWorkActor(
  organizationId?: string,
): Promise<WorkActor> {
  if (isDevTenantBypassEnabled()) {
    const bypassOrganizationId =
      organizationId ?? getAuthEnv().devOrganizationId;
    if (bypassOrganizationId) {
      const membership = await prisma.organizationMembership.findFirst({
        where: { organizationId: bypassOrganizationId },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      });
      if (membership) {
        return {
          organizationId: bypassOrganizationId,
          userId: membership.userId,
          role: membership.role,
          canViewAll: canViewAllRepWork(membership.role),
        };
      }
    }
  }
  const ctx = await getMembershipForCurrentUser(organizationId);
  return {
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    role: ctx.membership.role,
    canViewAll: canViewAllRepWork(ctx.membership.role),
  };
}

export function assertCanViewOwnedWork(
  actor: WorkActor,
  ownerUserId: string,
  resource = "Work item",
): void {
  if (
    !canViewOwnedWork({
      role: actor.role,
      userId: actor.userId,
      ownerUserId,
    })
  ) {
    throw new AuthorizationError(`${resource} is private to another user.`);
  }
}

export function assertCanModifyOwnedWork(
  actor: Pick<WorkActor, "userId">,
  ownerUserId: string,
  resource = "Work item",
): void {
  if (!canModifyOwnedWork({ userId: actor.userId, ownerUserId })) {
    throw new AuthorizationError(
      `${resource} is read-only because it belongs to another user.`,
    );
  }
}
