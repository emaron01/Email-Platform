/**
 * Production one-time platform SUPER_ADMIN provisioning — Node-safe (no server-only).
 *
 * Verifies the *complete* Better Auth identity before ALREADY_PROVISIONED.
 * Repairs partial/inconsistent links via Better Auth sign-up (never manual hashes).
 *
 * Env (temporary on Render):
 *   PLATFORM_BOOTSTRAP_EMAIL
 *   PLATFORM_BOOTSTRAP_PASSWORD
 *   PLATFORM_BOOTSTRAP_CONFIRM=PROVISION_INITIAL_SUPER_ADMIN
 */
import type { AuthUser, User } from "@prisma/client";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { prisma } from "@/lib/prisma-client";
import { normalizeEmail } from "@/lib/auth/provision-service";
import { recordAdminAuditEvent } from "@/lib/auth/audit-service";
import {
  beginPlatformSuperAdminProvisioning,
  endPlatformSuperAdminProvisioning,
} from "@/lib/auth/platform-provision-flag";

export const PLATFORM_BOOTSTRAP_CONFIRM_VALUE =
  "PROVISION_INITIAL_SUPER_ADMIN";

export const CREDENTIAL_ISSUER = createLocalAccountIssuer("credential");

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

export type PlatformProvisionStatus =
  | "CREATED"
  | "REPAIRED"
  | "ALREADY_PROVISIONED"
  | "FAILED_INCONSISTENT";

export type PlatformProvisionResult = {
  status: PlatformProvisionStatus;
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

export type IdentityConsistency = {
  ok: boolean;
  appUser: User;
  authUser: AuthUser | null;
  authUserId: string | null;
  credentialPresent: boolean;
  emailMatches: boolean;
  authEmailVerified: boolean;
  appEmailVerified: boolean;
  isSuperAdmin: boolean;
  discoverableByEmail: boolean;
  reasons: string[];
};

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

/** Better Auth 1.7.1 credential account for an AuthUser. */
export async function findCredentialAuthAccount(authUserId: string) {
  return prisma.authAccount.findFirst({
    where: {
      userId: authUserId,
      providerId: "credential",
      issuer: CREDENTIAL_ISSUER,
      accountId: authUserId,
    },
  });
}

/**
 * Full identity consistency check — never returns ALREADY_PROVISIONED from
 * authUserId alone.
 */
export async function assessPlatformIdentityConsistency(input: {
  appUser: User;
  email: string;
}): Promise<IdentityConsistency> {
  const email = normalizeEmail(input.email);
  const reasons: string[] = [];
  const authUserId = input.appUser.authUserId;
  let authUser: AuthUser | null = null;
  let credentialPresent = false;
  let emailMatches = false;
  let authEmailVerified = false;
  let discoverableByEmail = false;

  if (!authUserId) {
    reasons.push("application_user_missing_authUserId");
  } else {
    authUser = await prisma.authUser.findUnique({ where: { id: authUserId } });
    if (!authUser) {
      reasons.push(
        `stale_authUserId_missing_AuthUser:${authUserId}`,
      );
    } else {
      emailMatches = normalizeEmail(authUser.email) === email;
      if (!emailMatches) {
        reasons.push(
          `auth_email_mismatch:authUserId=${authUser.id}`,
        );
      }
      authEmailVerified = authUser.emailVerified === true;
      if (!authEmailVerified) reasons.push("auth_user_not_email_verified");

      const credential = await findCredentialAuthAccount(authUser.id);
      credentialPresent = Boolean(credential?.password);
      if (!credentialPresent) {
        reasons.push(`missing_credential_AuthAccount:authUserId=${authUser.id}`);
      }

      const byEmail = await prisma.authUser.findUnique({ where: { email } });
      discoverableByEmail = Boolean(byEmail && byEmail.id === authUser.id);
      if (!discoverableByEmail) {
        reasons.push("auth_user_not_discoverable_by_email");
      }
    }
  }

  const appEmailVerified = Boolean(input.appUser.emailVerifiedAt);
  if (!appEmailVerified) reasons.push("application_user_emailVerifiedAt_unset");

  const isSuperAdmin = input.appUser.platformRole === "SUPER_ADMIN";
  if (!isSuperAdmin) reasons.push("platformRole_not_SUPER_ADMIN");

  const ok =
    Boolean(authUserId) &&
    Boolean(authUser) &&
    emailMatches &&
    credentialPresent &&
    authEmailVerified &&
    appEmailVerified &&
    isSuperAdmin &&
    discoverableByEmail;

  return {
    ok,
    appUser: input.appUser,
    authUser,
    authUserId,
    credentialPresent,
    emailMatches,
    authEmailVerified,
    appEmailVerified,
    isSuperAdmin,
    discoverableByEmail,
    reasons,
  };
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

async function assertMembershipsUnchanged(
  userId: string,
  beforeIds: string[],
): Promise<void> {
  const after = await prisma.organizationMembership.findMany({
    where: { userId },
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  const afterIds = after.map((m) => m.organizationId);
  if (
    beforeIds.length !== afterIds.length ||
    beforeIds.some((id, i) => id !== afterIds[i])
  ) {
    throw new PlatformProvisionError(
      "Organization memberships changed during platform provisioning. Refusing to continue.",
    );
  }
  if (beforeIds.length === 0 && afterIds.length > 0) {
    throw new PlatformProvisionError(
      "Platform provisioning created an unexpected Organization membership.",
    );
  }
}

/**
 * Remove a broken Better Auth identity so signUpEmail can recreate it.
 * Does not write password hashes — only deletes unusable auth rows.
 */
async function removeBrokenAuthIdentity(
  authUserId: string,
  email: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.authSession.deleteMany({ where: { userId: authUserId } }),
    prisma.authAccount.deleteMany({ where: { userId: authUserId } }),
    prisma.authVerification.deleteMany({
      where: { identifier: { in: [authUserId, email] } },
    }),
    prisma.authUser.delete({ where: { id: authUserId } }),
  ]);
}

async function clearStaleAppAuthLink(userId: string): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { authUserId: null },
  });
}

async function createAuthIdentityViaBetterAuth(input: {
  appUser: User;
  email: string;
  password: string;
  signUpEmail: SignUpEmailFn;
}): Promise<{ authUserId: string; created: boolean }> {
  const firstName = input.appUser.firstName?.trim() || "Platform";
  const lastName = input.appUser.lastName?.trim() || "Admin";
  const name =
    input.appUser.name?.trim() || `${firstName} ${lastName}`.trim();

  beginPlatformSuperAdminProvisioning();
  try {
    const created = await input.signUpEmail({
      email: input.email,
      password: input.password,
      name,
      firstName,
      lastName,
    });
    return { authUserId: created.userId, created: true };
  } finally {
    endPlatformSuperAdminProvisioning();
  }
}

async function linkAppUserToAuthUser(
  appUserId: string,
  authUserId: string,
): Promise<User> {
  const conflict = await prisma.user.findUnique({
    where: { authUserId },
  });
  if (conflict && conflict.id !== appUserId) {
    throw new PlatformProvisionError(
      `AuthUser ${authUserId} is already linked to a different application User ${conflict.id}.`,
    );
  }
  return prisma.user.update({
    where: { id: appUserId },
    data: { authUserId },
  });
}

async function requirePassword(
  password: string | null,
  purpose: string,
): Promise<string> {
  if (!password || password.length < 10) {
    throw new PlatformProvisionError(
      `PLATFORM_BOOTSTRAP_PASSWORD is required (≥10 characters) to ${purpose}.`,
    );
  }
  return password;
}

/**
 * Ensure a usable Better Auth identity exists for this application User.
 * Returns whether a repair/create occurred (vs already fully consistent).
 */
async function ensureUsableAuthIdentity(input: {
  appUser: User;
  email: string;
  password: string | null;
  signUpEmail: SignUpEmailFn;
}): Promise<{ appUser: User; authUserId: string; repaired: boolean; created: boolean }> {
  const email = normalizeEmail(input.email);
  let appUser = input.appUser;
  let repaired = false;
  let created = false;

  // --- Stale authUserId → missing AuthUser ---
  if (appUser.authUserId) {
    const linked = await prisma.authUser.findUnique({
      where: { id: appUser.authUserId },
    });
    if (!linked) {
      appUser = await clearStaleAppAuthLink(appUser.id);
      repaired = true;
    } else if (normalizeEmail(linked.email) !== email) {
      throw new PlatformProvisionError(
        `FAILED_INCONSISTENT: linked AuthUser ${linked.id} email does not match PLATFORM_BOOTSTRAP_EMAIL (appUser=${appUser.id}).`,
      );
    }
  }

  // --- AuthUser by email ---
  let authByEmail = await prisma.authUser.findUnique({ where: { email } });

  if (authByEmail && appUser.authUserId && appUser.authUserId !== authByEmail.id) {
    // Stale pointer vs email identity — reconcile to the email AuthUser after
    // verifying credential state (no duplicate AuthUser).
    const staleId = appUser.authUserId;
    const stale = await prisma.authUser.findUnique({ where: { id: staleId } });
    if (stale) {
      throw new PlatformProvisionError(
        `FAILED_INCONSISTENT: app User ${appUser.id} authUserId=${staleId} but AuthUser by email is ${authByEmail.id}. Refusing ambiguous dual identity.`,
      );
    }
    appUser = await clearStaleAppAuthLink(appUser.id);
    repaired = true;
  }

  if (authByEmail) {
    const credential = await findCredentialAuthAccount(authByEmail.id);
    if (!credential?.password) {
      // AuthUser exists but credential unusable — remove broken identity,
      // recreate via Better Auth (authoritative password handling).
      const password = await requirePassword(
        input.password,
        "repair the missing credential AuthAccount",
      );
      // Unlink app users pointing at this AuthUser before delete
      await prisma.user.updateMany({
        where: { authUserId: authByEmail.id },
        data: { authUserId: null },
      });
      await removeBrokenAuthIdentity(authByEmail.id, email);
      authByEmail = null;
      appUser = await prisma.user.findUniqueOrThrow({ where: { id: appUser.id } });
      repaired = true;

      const createdAuth = await createAuthIdentityViaBetterAuth({
        appUser,
        email,
        password,
        signUpEmail: input.signUpEmail,
      });
      created = createdAuth.created;
      appUser = await linkAppUserToAuthUser(appUser.id, createdAuth.authUserId);
      return { appUser, authUserId: createdAuth.authUserId, repaired, created };
    }

    // Credential OK — link if needed
    if (appUser.authUserId !== authByEmail.id) {
      appUser = await linkAppUserToAuthUser(appUser.id, authByEmail.id);
      repaired = true;
    }
    return { appUser, authUserId: authByEmail.id, repaired, created };
  }

  // --- No AuthUser by email: create via Better Auth ---
  if (appUser.authUserId) {
    // Pointer without matching email AuthUser (should have been cleared above)
    const orphan = await prisma.authUser.findUnique({
      where: { id: appUser.authUserId },
    });
    if (!orphan) {
      appUser = await clearStaleAppAuthLink(appUser.id);
      repaired = true;
    }
  }

  const password = await requirePassword(
    input.password,
    "create the Better Auth identity",
  );
  const createdAuth = await createAuthIdentityViaBetterAuth({
    appUser,
    email,
    password,
    signUpEmail: input.signUpEmail,
  });
  created = true;
  if (repaired || appUser.authUserId) {
    // Had prior partial state
    repaired = repaired || Boolean(appUser.authUserId);
  }
  appUser = await linkAppUserToAuthUser(appUser.id, createdAuth.authUserId);
  return { appUser, authUserId: createdAuth.authUserId, repaired, created };
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

  const prior = await assessPlatformIdentityConsistency({ appUser, email });

  let status: PlatformProvisionStatus;
  let authUserId: string;

  if (prior.ok) {
    status = "ALREADY_PROVISIONED";
    authUserId = prior.authUserId!;
  } else {
    const ensured = await ensureUsableAuthIdentity({
      appUser,
      email,
      password: input.password,
      signUpEmail: input.signUpEmail,
    });
    appUser = ensured.appUser;
    authUserId = ensured.authUserId;

    await markVerified(authUserId, appUser.id);
    appUser = await prisma.user.update({
      where: { id: appUser.id },
      data: { platformRole: "SUPER_ADMIN" },
    });

    const after = await assessPlatformIdentityConsistency({ appUser, email });
    if (!after.ok) {
      throw new PlatformProvisionError(
        `FAILED_INCONSISTENT after repair: ${after.reasons.join("; ")}`,
      );
    }

    const authWasBroken = prior.reasons.some(
      (r) =>
        r.includes("stale") ||
        r.includes("missing_credential") ||
        r.includes("missing_AuthUser") ||
        r.includes("not_discoverable") ||
        r.includes("auth_email"),
    );
    status =
      ensured.repaired || authWasBroken || Boolean(prior.authUserId)
        ? "REPAIRED"
        : "CREATED";

    await recordAdminAuditEvent({
      action: "PLATFORM_SUPER_ADMIN_PROVISIONED",
      actorUserId: appUser.id,
      targetUserId: appUser.id,
      organizationId: appUser.activeOrganizationId,
      metadata: {
        via: "platform:provision-super-admin",
        email,
        outcome: status,
        priorReasons: prior.reasons,
        // Never include password / hashes / tokens.
      },
    });
  }

  await assertMembershipsUnchanged(appUser.id, membershipOrgIdsBefore);

  // Final gate — never claim success without discoverable credential identity
  const finalCheck = await assessPlatformIdentityConsistency({
    appUser: await prisma.user.findUniqueOrThrow({ where: { id: appUser.id } }),
    email,
  });
  if (!finalCheck.ok) {
    throw new PlatformProvisionError(
      `FAILED_INCONSISTENT: ${finalCheck.reasons.join("; ")}`,
    );
  }

  appUser = finalCheck.appUser;

  const messages: Record<PlatformProvisionStatus, string> = {
    ALREADY_PROVISIONED:
      "Platform SUPER_ADMIN already fully provisioned (AuthUser + credential verified). Log in at /login.",
    CREATED:
      "Platform SUPER_ADMIN created and email-verified. Log in at /login, then remove PLATFORM_BOOTSTRAP_* from Render.",
    REPAIRED:
      "Platform SUPER_ADMIN identity repaired via Better Auth. Log in at /login, then remove PLATFORM_BOOTSTRAP_* from Render.",
    FAILED_INCONSISTENT: "Provisioning failed due to inconsistent identity state.",
  };

  return {
    status,
    userId: appUser.id,
    authUserId: finalCheck.authUserId!,
    email: appUser.email,
    platformRole: "SUPER_ADMIN",
    emailVerified: true,
    organizationId: appUser.activeOrganizationId,
    message: messages[status],
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
  const { formatSafeErrorForLog } = await import("@/lib/auth/safe-error");
  try {
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
  } catch (error) {
    if (error instanceof PlatformProvisionError) throw error;
    throw new PlatformProvisionError(
      `Better Auth identity creation failed: ${formatSafeErrorForLog(error)}`,
    );
  }
}
