/**
 * Production one-time platform SUPER_ADMIN provisioning — Node-safe (no server-only).
 * Distinct from local development auth:bootstrap.
 *
 * CLI entry: scripts/platform-provision-super-admin.ts
 * Next.js entry (if needed): `@/lib/auth/platform-provision` (server-only wrapper)
 *
 * Env (temporary on Render):
 *   PLATFORM_BOOTSTRAP_EMAIL
 *   PLATFORM_BOOTSTRAP_PASSWORD
 *   PLATFORM_BOOTSTRAP_CONFIRM=PROVISION_INITIAL_SUPER_ADMIN
 */
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/provision-service";
import { recordAdminAuditEvent } from "@/lib/auth/audit-service";
import {
  beginPlatformSuperAdminProvisioning,
  endPlatformSuperAdminProvisioning,
} from "@/lib/auth/platform-provision-flag";

export const PLATFORM_BOOTSTRAP_CONFIRM_VALUE =
  "PROVISION_INITIAL_SUPER_ADMIN";

export class PlatformProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformProvisionError";
  }
}

export type PlatformProvisionEnv = {
  email: string;
  password: string | null;
  confirm: string | null;
};

export type PlatformProvisionResult = {
  status: "provisioned" | "already_provisioned";
  userId: string;
  authUserId: string;
  email: string;
  platformRole: "SUPER_ADMIN";
  emailVerified: true;
  organizationId: string | null;
  message: string;
};

export function readPlatformProvisionEnv(
  env: NodeJS.ProcessEnv = process.env,
): PlatformProvisionEnv {
  const emailRaw = env.PLATFORM_BOOTSTRAP_EMAIL?.trim();
  if (!emailRaw) {
    throw new PlatformProvisionError(
      "PLATFORM_BOOTSTRAP_EMAIL is required.",
    );
  }
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PlatformProvisionError(
      "PLATFORM_BOOTSTRAP_EMAIL is not a valid email address.",
    );
  }
  return {
    email,
    password: env.PLATFORM_BOOTSTRAP_PASSWORD?.trim() || null,
    confirm: env.PLATFORM_BOOTSTRAP_CONFIRM?.trim() || null,
  };
}

/** Fail closed unless the exact confirmation string is present. */
export function assertPlatformProvisionConfirmation(
  confirm: string | null | undefined,
): void {
  if (confirm !== PLATFORM_BOOTSTRAP_CONFIRM_VALUE) {
    throw new PlatformProvisionError(
      `PLATFORM_BOOTSTRAP_CONFIRM must be exactly "${PLATFORM_BOOTSTRAP_CONFIRM_VALUE}". Refusing to provision.`,
    );
  }
}

export type SignUpEmailFn = (input: {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
}) => Promise<{ userId: string }>;

async function ensureApplicationUser(email: string): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { emailNormalized: email },
  });
  if (existing) return existing;

  const local = email.split("@")[0] || "Platform";
  const firstName = "Platform";
  const lastName = "Admin";
  return prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      firstName,
      lastName,
      name: `${firstName} ${lastName} (${local})`,
      platformRole: "NONE",
    },
  });
}

async function markVerified(authUserId: string, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.authUser.update({
      where: { id: authUserId },
      data: { emailVerified: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
}

/**
 * Provision or reconcile the initial platform SUPER_ADMIN.
 * Does not create a customer Organization when the operator has none.
 */
export async function provisionPlatformSuperAdmin(input: {
  email: string;
  password: string | null;
  confirm: string | null;
  signUpEmail: SignUpEmailFn;
}): Promise<PlatformProvisionResult> {
  assertPlatformProvisionConfirmation(input.confirm);
  const email = normalizeEmail(input.email);

  let appUser = await ensureApplicationUser(email);

  const membershipBefore = await prisma.organizationMembership.findMany({
    where: { userId: appUser.id },
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  const membershipOrgIdsBefore = membershipBefore.map((m) => m.organizationId);

  let authUserId = appUser.authUserId;
  let createdAuth = false;

  if (authUserId) {
    const authUser = await prisma.authUser.findUnique({
      where: { id: authUserId },
    });
    if (!authUser) {
      throw new PlatformProvisionError(
        `User.authUserId=${authUserId} points to a missing AuthUser. Manual repair required.`,
      );
    }
    if (normalizeEmail(authUser.email) !== email) {
      throw new PlatformProvisionError(
        "Linked AuthUser email does not match PLATFORM_BOOTSTRAP_EMAIL.",
      );
    }
  } else {
    const existingAuth = await prisma.authUser.findUnique({
      where: { email },
    });

    if (existingAuth) {
      const conflict = await prisma.user.findUnique({
        where: { authUserId: existingAuth.id },
      });
      if (conflict && conflict.id !== appUser.id) {
        throw new PlatformProvisionError(
          `AuthUser for ${email} is already linked to a different application User.`,
        );
      }
      appUser = await prisma.user.update({
        where: { id: appUser.id },
        data: { authUserId: existingAuth.id },
      });
      authUserId = existingAuth.id;
    } else {
      if (!input.password || input.password.length < 10) {
        throw new PlatformProvisionError(
          "PLATFORM_BOOTSTRAP_PASSWORD is required (≥10 characters) to create the Better Auth identity.",
        );
      }

      beginPlatformSuperAdminProvisioning();
      try {
        const firstName = appUser.firstName?.trim() || "Platform";
        const lastName = appUser.lastName?.trim() || "Admin";
        const name =
          appUser.name?.trim() || `${firstName} ${lastName}`.trim();

        const created = await input.signUpEmail({
          email,
          password: input.password,
          name,
          firstName,
          lastName,
        });
        authUserId = created.userId;
        createdAuth = true;

        const linkedByAuth = await prisma.user.findUnique({
          where: { authUserId },
        });
        if (linkedByAuth && linkedByAuth.id !== appUser.id) {
          throw new PlatformProvisionError(
            `Better Auth linked to unexpected User ${linkedByAuth.id}; expected ${appUser.id}.`,
          );
        }

        appUser = await prisma.user.findUniqueOrThrow({
          where: { id: appUser.id },
        });
        if (!appUser.authUserId) {
          appUser = await prisma.user.update({
            where: { id: appUser.id },
            data: { authUserId },
          });
        } else if (appUser.authUserId !== authUserId) {
          throw new PlatformProvisionError(
            "Application User linked to a different auth identity than expected.",
          );
        }
      } finally {
        endPlatformSuperAdminProvisioning();
      }
    }
  }

  if (!authUserId) {
    throw new PlatformProvisionError("Failed to resolve AuthUser id.");
  }

  const alreadySuper =
    appUser.platformRole === "SUPER_ADMIN" &&
    Boolean(appUser.emailVerifiedAt) &&
    (
      await prisma.authUser.findUniqueOrThrow({ where: { id: authUserId } })
    ).emailVerified;

  await markVerified(authUserId, appUser.id);
  appUser = await prisma.user.update({
    where: { id: appUser.id },
    data: { platformRole: "SUPER_ADMIN" },
  });

  const membershipAfter = await prisma.organizationMembership.findMany({
    where: { userId: appUser.id },
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  const membershipOrgIdsAfter = membershipAfter.map((m) => m.organizationId);
  if (
    membershipOrgIdsBefore.length !== membershipOrgIdsAfter.length ||
    membershipOrgIdsBefore.some((id, i) => id !== membershipOrgIdsAfter[i])
  ) {
    throw new PlatformProvisionError(
      "Organization memberships changed during platform provisioning. Refusing to continue.",
    );
  }

  // Platform operators must not gain a new tenant org solely from this CLI.
  if (membershipOrgIdsBefore.length === 0 && membershipOrgIdsAfter.length > 0) {
    throw new PlatformProvisionError(
      "Platform provisioning created an unexpected Organization membership.",
    );
  }

  const status = alreadySuper && !createdAuth ? "already_provisioned" : "provisioned";

  if (status === "provisioned") {
    await recordAdminAuditEvent({
      action: "PLATFORM_SUPER_ADMIN_PROVISIONED",
      actorUserId: appUser.id,
      targetUserId: appUser.id,
      organizationId: appUser.activeOrganizationId,
      metadata: {
        via: "platform:provision-super-admin",
        email,
        createdAuthIdentity: createdAuth,
        // Never include password / hashes / tokens.
      },
    });
  }

  return {
    status,
    userId: appUser.id,
    authUserId,
    email: appUser.email,
    platformRole: "SUPER_ADMIN",
    emailVerified: true,
    organizationId: appUser.activeOrganizationId,
    message:
      status === "already_provisioned"
        ? "Platform SUPER_ADMIN already provisioned. Log in at /login."
        : "Platform SUPER_ADMIN provisioned and email-verified. Log in at /login, then remove PLATFORM_BOOTSTRAP_* from Render.",
  };
}

/** Better Auth API adapter — never hashes passwords manually. */
export async function signUpEmailViaBetterAuth(input: {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
}): Promise<{ userId: string }> {
  const { auth } = await import("@/lib/auth/better-auth");
  const result = await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });

  const userId =
    result &&
    typeof result === "object" &&
    "user" in result &&
    result.user &&
    typeof result.user === "object" &&
    "id" in result.user
      ? String((result.user as { id: string }).id)
      : null;

  if (!userId) {
    const authUser = await prisma.authUser.findUnique({
      where: { email: input.email },
    });
    if (!authUser) {
      throw new PlatformProvisionError(
        "Better Auth signUpEmail did not return a user id and AuthUser was not found.",
      );
    }
    return { userId: authUser.id };
  }
  return { userId };
}
