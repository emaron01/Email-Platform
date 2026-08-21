import "server-only";

import type { Organization, OrganizationMembership, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDevTenantBypassEnabled, getAuthEnv } from "@/lib/auth/config";
import { TenantError } from "@/lib/tenant/errors";

export type SessionContext = {
  authUserId: string;
  user: User;
  sessionToken: string;
};

async function getAuthSession() {
  const { auth } = await import("@/lib/auth/server");
  const { headers } = await import("next/headers");
  return auth.api.getSession({
    headers: await headers(),
  });
}

/**
 * Authoritative application User from authenticated Better Auth session.
 * Never trusts browser-supplied userId/organizationId/role as truth.
 */
export async function getCurrentUser(): Promise<User | null> {
  // Production never uses DEV bypass.
  if (isDevTenantBypassEnabled()) {
    const env = getAuthEnv();
    if (env.devUserId) {
      return prisma.user.findUnique({ where: { id: env.devUserId } });
    }
    if (env.devOrganizationId) {
      const membership = await prisma.organizationMembership.findFirst({
        where: {
          organizationId: env.devOrganizationId,
          OR: [{ role: "OWNER" }, { role: "ADMIN" }],
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      return membership?.user ?? null;
    }
  }

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return null;
    return prisma.user.findUnique({
      where: { authUserId: session.user.id },
    });
  } catch {
    // Outside a Next.js request (e.g. some unit tests) session resolution fails closed.
    return null;
  }
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new TenantError("Authentication required.");
  }
  return user;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  if (isDevTenantBypassEnabled()) {
    const user = await getCurrentUser();
    if (!user) return null;
    return {
      authUserId: user.authUserId ?? `dev:${user.id}`,
      user,
      sessionToken: "dev-bypass",
    };
  }

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return null;
    const user = await prisma.user.findUnique({
      where: { authUserId: session.user.id },
    });
    if (!user) return null;
    return {
      authUserId: session.user.id,
      user,
      sessionToken: session.session.token,
    };
  } catch {
    return null;
  }
}

export type MembershipContext = {
  user: User;
  organization: Organization;
  membership: OrganizationMembership;
};

/**
 * Resolve active Organization from membership — never from client-supplied IDs alone.
 */
export async function resolveActiveOrganization(
  user: User,
  requestedOrganizationId?: string | null,
): Promise<MembershipContext | null> {
  if (requestedOrganizationId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: requestedOrganizationId,
          userId: user.id,
        },
      },
      include: { organization: true },
    });
    if (!membership) {
      throw new TenantError(
        "You are not a member of the requested organization.",
      );
    }
    return {
      user,
      organization: membership.organization,
      membership,
    };
  }

  if (user.activeOrganizationId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: user.activeOrganizationId,
          userId: user.id,
        },
      },
      include: { organization: true },
    });
    if (membership) {
      return {
        user,
        organization: membership.organization,
        membership,
      };
    }
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) return null;

  const chosen = memberships[0]!;
  if (memberships.length === 1 || !user.activeOrganizationId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { activeOrganizationId: chosen.organizationId },
    });
  }

  return {
    user,
    organization: chosen.organization,
    membership: chosen,
  };
}

export async function setActiveOrganization(input: {
  userId: string;
  organizationId: string;
}): Promise<void> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
  });
  if (!membership) {
    throw new TenantError(
      "Cannot switch to an organization you do not belong to.",
    );
  }
  await prisma.user.update({
    where: { id: input.userId },
    data: { activeOrganizationId: input.organizationId },
  });
}
