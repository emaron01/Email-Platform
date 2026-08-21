import "server-only";

import type { MembershipRole, Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/provision";

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapError";
  }
}

export type BootstrapEnv = {
  email: string;
  password: string | null;
  existingUserId: string | null;
  markEmailVerified: boolean;
  allowInProduction: boolean;
  isProduction: boolean;
};

export type BootstrapResult = {
  status: "linked" | "already_linked" | "created_and_linked";
  userId: string;
  authUserId: string;
  organizationId: string;
  organizationName: string;
  membershipRole: MembershipRole;
  emailVerified: boolean;
  organizationCountUnchanged: true;
  message: string;
};

export type PlatformBootstrapResult = {
  status: "granted" | "already_super_admin";
  userId: string;
  email: string;
  platformRole: "SUPER_ADMIN";
  message: string;
};

/** Fail-closed gate for bootstrap CLIs. */
export function assertBootstrapAllowed(env: {
  isProduction: boolean;
  allowInProduction: boolean;
}): void {
  if (env.isProduction && !env.allowInProduction) {
    throw new BootstrapError(
      "Auth bootstrap is disabled in production. Set ALLOW_AUTH_BOOTSTRAP=true only for initial platform provisioning, then remove it.",
    );
  }
}

export function readBootstrapEnv(
  env: NodeJS.ProcessEnv = process.env,
): BootstrapEnv {
  const isProduction = env.NODE_ENV === "production";
  const emailRaw = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!emailRaw) {
    throw new BootstrapError(
      "BOOTSTRAP_ADMIN_EMAIL is required (do not hard-code an email in source).",
    );
  }
  return {
    email: normalizeEmail(emailRaw),
    password: env.BOOTSTRAP_ADMIN_PASSWORD?.trim() || null,
    existingUserId: env.BOOTSTRAP_EXISTING_USER_ID?.trim() || null,
    markEmailVerified: env.BOOTSTRAP_MARK_EMAIL_VERIFIED?.trim() === "true",
    allowInProduction: env.ALLOW_AUTH_BOOTSTRAP?.trim() === "true",
    isProduction,
  };
}

export function readPlatformBootstrapEmail(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw =
    env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim() ||
    env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!raw) {
    throw new BootstrapError(
      "BOOTSTRAP_SUPER_ADMIN_EMAIL (or BOOTSTRAP_ADMIN_EMAIL) is required.",
    );
  }
  return normalizeEmail(raw);
}

function mismatchInstructions(input: {
  targetEmail: string;
  candidates: Array<{ id: string; email: string; orgName: string | null }>;
}): string {
  const lines = [
    `No application User matches BOOTSTRAP_ADMIN_EMAIL="${input.targetEmail}".`,
    "Refusing to guess which User to link.",
    "",
    "Unlinked application Users (authUserId is null):",
  ];
  if (input.candidates.length === 0) {
    lines.push("  (none found)");
  } else {
    for (const c of input.candidates) {
      lines.push(
        `  - userId=${c.id} email=${c.email} organization=${c.orgName ?? "(none)"}`,
      );
    }
  }
  lines.push(
    "",
    "Safe resolution options:",
    "1) Set BOOTSTRAP_ADMIN_EMAIL to the existing User email above, OR",
    "2) Set BOOTSTRAP_EXISTING_USER_ID=<userId> so bootstrap can retarget that User's email",
    "   to BOOTSTRAP_ADMIN_EMAIL (only when that User is still unlinked), then re-run.",
  );
  return lines.join("\n");
}

/**
 * Resolve the single application User that bootstrap is allowed to link.
 * Deterministic: email match, or explicit BOOTSTRAP_EXISTING_USER_ID retarget.
 */
export async function resolveBootstrapAppUser(input: {
  email: string;
  existingUserId: string | null;
}): Promise<User> {
  const byEmail = await prisma.user.findUnique({
    where: { emailNormalized: input.email },
  });

  if (input.existingUserId) {
    const byId = await prisma.user.findUnique({
      where: { id: input.existingUserId },
    });
    if (!byId) {
      throw new BootstrapError(
        `BOOTSTRAP_EXISTING_USER_ID="${input.existingUserId}" does not exist.`,
      );
    }
    if (byEmail && byEmail.id !== byId.id) {
      throw new BootstrapError(
        [
          "Ambiguous User matching refused.",
          `BOOTSTRAP_ADMIN_EMAIL matches userId=${byEmail.id},`,
          `but BOOTSTRAP_EXISTING_USER_ID points to userId=${byId.id}.`,
          "Use one identity only.",
        ].join(" "),
      );
    }
    if (byId.authUserId) {
      if (normalizeEmail(byId.email) === input.email) {
        return byId;
      }
      throw new BootstrapError(
        `User ${byId.id} is already linked to a Better Auth identity. Refusing to change email.`,
      );
    }
    // Explicit retarget: update email to the bootstrap identity email.
    if (normalizeEmail(byId.email) !== input.email) {
      const conflict = await prisma.user.findUnique({
        where: { emailNormalized: input.email },
      });
      if (conflict && conflict.id !== byId.id) {
        throw new BootstrapError(
          `Cannot retarget: email ${input.email} is already used by another User.`,
        );
      }
      return prisma.user.update({
        where: { id: byId.id },
        data: {
          email: input.email,
          emailNormalized: input.email,
        },
      });
    }
    return byId;
  }

  if (byEmail) return byEmail;

  const unlinked = await prisma.user.findMany({
    where: { authUserId: null },
    include: {
      memberships: {
        include: { organization: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });

  throw new BootstrapError(
    mismatchInstructions({
      targetEmail: input.email,
      candidates: unlinked.map((u) => ({
        id: u.id,
        email: u.email,
        orgName: u.memberships[0]?.organization.name ?? null,
      })),
    }),
  );
}

async function listUserOrganizationIds(userId: string): Promise<string[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId },
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  return memberships.map((m) => m.organizationId);
}

async function ensureAdminMembership(userId: string): Promise<{
  organization: Organization;
  membershipRole: MembershipRole;
}> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    throw new BootstrapError(
      "Target User has no OrganizationMembership. Refusing to create a new Organization during bootstrap.",
    );
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  let chosen =
    memberships.find((m) => m.organizationId === user.activeOrganizationId) ??
    memberships[0]!;

  // Promote MEMBER → ADMIN; keep OWNER/ADMIN as-is.
  if (chosen.role === "MEMBER") {
    chosen = await prisma.organizationMembership.update({
      where: { id: chosen.id },
      data: { role: "ADMIN" },
      include: { organization: true },
    });
  }

  if (user.activeOrganizationId !== chosen.organizationId) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeOrganizationId: chosen.organizationId },
    });
  }

  return {
    organization: chosen.organization,
    membershipRole: chosen.role,
  };
}

export type SignUpEmailFn = (input: {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
}) => Promise<{ userId: string }>;

/**
 * Link existing app User ↔ Better Auth identity without creating a new Organization.
 */
export async function bootstrapAdminAccount(input: {
  email: string;
  password: string | null;
  existingUserId: string | null;
  markEmailVerified: boolean;
  isProduction: boolean;
  signUpEmail: SignUpEmailFn;
}): Promise<BootstrapResult> {
  if (input.markEmailVerified && input.isProduction) {
    throw new BootstrapError(
      "BOOTSTRAP_MARK_EMAIL_VERIFIED is not allowed in production. Use the real verification email flow.",
    );
  }

  const appUser = await resolveBootstrapAppUser({
    email: input.email,
    existingUserId: input.existingUserId,
  });

  // Refuse if user has no membership — would cause provision hook to create an org.
  const membershipCheck = await prisma.organizationMembership.count({
    where: { userId: appUser.id },
  });
  if (membershipCheck === 0) {
    throw new BootstrapError(
      "Target User has no OrganizationMembership. Bootstrap will not create Organizations.",
    );
  }

  const orgIdsBefore = await listUserOrganizationIds(appUser.id);

  let authUserId = appUser.authUserId;
  let status: BootstrapResult["status"] = "already_linked";

  if (authUserId) {
    const authUser = await prisma.authUser.findUnique({
      where: { id: authUserId },
    });
    if (!authUser) {
      throw new BootstrapError(
        `User.authUserId=${authUserId} points to a missing AuthUser. Manual repair required.`,
      );
    }
    if (normalizeEmail(authUser.email) !== input.email) {
      throw new BootstrapError(
        "Linked AuthUser email does not match BOOTSTRAP_ADMIN_EMAIL. Refusing to continue.",
      );
    }
  } else {
    const existingAuth = await prisma.authUser.findUnique({
      where: { email: input.email },
    });

    if (existingAuth) {
      // Auth identity exists but app User not linked — link without creating org.
      await prisma.user.update({
        where: { id: appUser.id },
        data: { authUserId: existingAuth.id },
      });
      authUserId = existingAuth.id;
      status = "linked";
    } else {
      if (!input.password || input.password.length < 10) {
        throw new BootstrapError(
          "BOOTSTRAP_ADMIN_PASSWORD is required (≥10 chars) to create the Better Auth identity via Better Auth APIs.",
        );
      }
      const firstName = appUser.firstName?.trim() || "Admin";
      const lastName = appUser.lastName?.trim() || "User";
      const name =
        appUser.name?.trim() || [firstName, lastName].filter(Boolean).join(" ");

      const created = await input.signUpEmail({
        email: input.email,
        password: input.password,
        name,
        firstName,
        lastName,
      });
      authUserId = created.userId;

      // Re-load — database hook should have linked the target User.
      const linkedByAuth = await prisma.user.findUnique({
        where: { authUserId },
      });
      if (linkedByAuth && linkedByAuth.id !== appUser.id) {
        throw new BootstrapError(
          [
            `Better Auth provisioning linked authUserId to a different User (${linkedByAuth.id})`,
            `than the bootstrap target (${appUser.id}).`,
            "Refusing to merge. Inspect database before retrying.",
          ].join(" "),
        );
      }

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: appUser.id },
      });
      if (!after.authUserId) {
        await prisma.user.update({
          where: { id: appUser.id },
          data: { authUserId },
        });
      } else if (after.authUserId !== authUserId) {
        throw new BootstrapError(
          "Provisioning linked a different auth identity than expected. Aborting.",
        );
      }
      status = "created_and_linked";
    }
  }

  const { organization, membershipRole } = await ensureAdminMembership(
    appUser.id,
  );

  if (input.markEmailVerified) {
    await prisma.authUser.update({
      where: { id: authUserId },
      data: { emailVerified: true },
    });
    await prisma.user.update({
      where: { id: appUser.id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  const orgIdsAfter = await listUserOrganizationIds(appUser.id);
  const beforeSet = new Set(orgIdsBefore);
  const afterSet = new Set(orgIdsAfter);
  const membershipOrgsUnchanged =
    orgIdsBefore.length === orgIdsAfter.length &&
    orgIdsAfter.every((id) => beforeSet.has(id)) &&
    orgIdsBefore.every((id) => afterSet.has(id));

  if (!membershipOrgsUnchanged || !beforeSet.has(organization.id)) {
    throw new BootstrapError(
      "User Organization memberships changed during bootstrap (possible duplicate Organization). Refusing to continue; inspect database.",
    );
  }

  const authUser = await prisma.authUser.findUniqueOrThrow({
    where: { id: authUserId },
  });

  const message =
    status === "already_linked"
      ? "Already linked. Log in at /login with this email."
      : status === "created_and_linked"
        ? input.markEmailVerified
          ? "Created Better Auth identity, linked existing User/Organization. Email marked verified (local emergency)."
          : "Created Better Auth identity and linked existing User/Organization. Check SMTP inbox and open the verification link, then log in at /login."
        : "Linked existing Better Auth identity to application User. Verify email if needed, then log in at /login.";

  return {
    status,
    userId: appUser.id,
    authUserId,
    organizationId: organization.id,
    organizationName: organization.name,
    membershipRole,
    emailVerified: authUser.emailVerified,
    organizationCountUnchanged: true,
    message,
  };
}

/**
 * Grant PlatformRole.SUPER_ADMIN to a linked authenticated User.
 * Does not change Organization membership roles.
 */
export async function bootstrapPlatformSuperAdmin(input: {
  email: string;
}): Promise<PlatformBootstrapResult> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({
    where: { emailNormalized: email },
  });
  if (!user) {
    throw new BootstrapError(
      `No application User with email "${email}". Run auth bootstrap first.`,
    );
  }
  if (!user.authUserId) {
    throw new BootstrapError(
      `User ${user.id} is not linked to Better Auth yet. Run npm run auth:bootstrap first.`,
    );
  }
  if (user.platformRole === "SUPER_ADMIN") {
    return {
      status: "already_super_admin",
      userId: user.id,
      email: user.email,
      platformRole: "SUPER_ADMIN",
      message: "User already has PlatformRole.SUPER_ADMIN.",
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { platformRole: "SUPER_ADMIN" },
  });

  return {
    status: "granted",
    userId: user.id,
    email: user.email,
    platformRole: "SUPER_ADMIN",
    message:
      "Granted PlatformRole.SUPER_ADMIN. Access /platform/email-templates after login.",
  };
}

/** Default Better Auth sign-up adapter used by the CLI. */
export async function signUpEmailViaBetterAuth(input: {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
}): Promise<{ userId: string }> {
  const { auth } = await import("@/lib/auth/server");
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
    // Fallback: load by email if API shape differs.
    const authUser = await prisma.authUser.findUnique({
      where: { email: input.email },
    });
    if (!authUser) {
      throw new BootstrapError(
        "Better Auth signUpEmail did not return a user id and AuthUser was not found.",
      );
    }
    return { userId: authUser.id };
  }
  return { userId };
}
