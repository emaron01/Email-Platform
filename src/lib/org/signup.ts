import "server-only";

import { createHash, randomBytes } from "crypto";
import type { MembershipRole, Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canManageInvitations,
  canRenameWorkspace,
  AuthorizationError,
} from "@/lib/org/authz";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";

export class SignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignupError";
  }
}

export class InvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationError";
  }
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Individual signup provisioning (shared by auth hooks and tests).
 * Creates User + Organization + OWNER membership + policies + billing profile.
 * OWNER = billing/account owner; ADMIN = can manage policy/invites.
 * Invite-as-OWNER is forbidden (see createOrganizationInvitation).
 */
export async function createIndividualWorkspace(input: {
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  timezone?: string;
  authUserId?: string | null;
}): Promise<{
  user: User;
  organization: Organization;
  membershipRole: MembershipRole;
}> {
  const { provisionIndividualWorkspace } = await import(
    "@/lib/auth/provision"
  );
  const email = input.email.trim().toLowerCase();
  const firstName =
    input.firstName?.trim() ||
    input.name?.trim()?.split(/\s+/)[0] ||
    email.split("@")[0] ||
    "User";
  const lastName =
    input.lastName?.trim() ||
    input.name?.trim()?.split(/\s+/).slice(1).join(" ") ||
    "";

  // Test helper path without Better Auth identity: synthesize a stable auth id.
  const authUserId =
    input.authUserId?.trim() ||
    `test_auth_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;

  const result = await provisionIndividualWorkspace({
    authUserId,
    email,
    firstName,
    lastName,
    timezone: input.timezone,
  });

  if (!result.organization) {
    throw new SignupError(
      "Workspace provisioning did not create an organization.",
    );
  }

  return {
    user: result.user,
    organization: result.organization,
    membershipRole: result.membershipRole,
  };
}

export async function renameOrganizationWorkspace(input: {
  organizationId: string;
  actorUserId: string;
  name: string;
}): Promise<Organization> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.actorUserId,
      },
    },
  });
  if (!membership || !canRenameWorkspace(membership.role)) {
    throw new AuthorizationError(
      "Only OWNER or ADMIN can rename the workspace.",
    );
  }
  const name = input.name.trim();
  if (!name) throw new SignupError("Workspace name is required.");

  return prisma.organization.update({
    where: { id: input.organizationId },
    data: { name },
  });
}

/**
 * Create an invitation. Stores token hash only; returns raw token once.
 */
export async function createOrganizationInvitation(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role?: MembershipRole;
  expiresInDays?: number;
}): Promise<{ invitationId: string; rawToken: string; expiresAt: Date }> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.invitedByUserId,
      },
    },
  });
  if (!membership || !canManageInvitations(membership.role)) {
    throw new AuthorizationError(
      "Only OWNER or ADMIN can invite users.",
    );
  }

  const email = input.email.trim().toLowerCase();
  const role = input.role ?? "MEMBER";
  if (role === "OWNER") {
    throw new InvitationError(
      "Cannot invite as OWNER. Transfer ownership explicitly.",
    );
  }

  const existingMember = await prisma.user.findUnique({ where: { email } });
  if (existingMember) {
    const already = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: existingMember.id,
        },
      },
    });
    if (already) {
      throw new InvitationError("User is already a member of this organization.");
    }
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + (input.expiresInDays ?? 7),
  );

  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: input.organizationId,
      email,
      role,
      tokenHash,
      status: "PENDING",
      expiresAt,
      invitedByUserId: input.invitedByUserId,
    },
  });

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_INVITATION_CREATED",
    actorUserId: input.invitedByUserId,
    organizationId: input.organizationId,
    metadata: { invitationId: invitation.id, role, email },
  });

  // Send invitation email via DB template (never hard-code copy).
  try {
    const { sendTransactionalEmail } = await import(
      "@/lib/transactional-email/send"
    );
    const { getAuthEnv } = await import("@/lib/auth/config");
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
    });
    const inviter = await prisma.user.findUnique({
      where: { id: input.invitedByUserId },
    });
    const appUrl = getAuthEnv().appUrl;
    await sendTransactionalEmail({
      templateKey: "ORGANIZATION_INVITATION",
      to: email,
      userId: input.invitedByUserId,
      organizationId: input.organizationId,
      variables: {
        firstName: inviter?.firstName || "there",
        workspaceName: org.name,
        inviterName: inviter?.name || inviter?.email || "A teammate",
        invitedEmail: email,
        invitationUrl: `${appUrl}/invite/accept?token=${rawToken}`,
        expirationTime: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    // Invitation remains valid; caller can resend. Do not leak provider secrets.
    console.error("[invitation-email] failed to send", {
      invitationId: invitation.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return {
    invitationId: invitation.id,
    rawToken,
    expiresAt,
  };
}

export async function acceptOrganizationInvitation(input: {
  rawToken: string;
  acceptingUserId: string;
}): Promise<{ organizationId: string; role: MembershipRole }> {
  const tokenHash = hashToken(input.rawToken);
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash },
  });

  if (!invitation) {
    throw new InvitationError("Invitation not found.");
  }
  if (invitation.status === "REVOKED") {
    throw new InvitationError("Invitation has been revoked.");
  }
  if (invitation.status === "ACCEPTED") {
    throw new InvitationError("Invitation has already been used.");
  }
  if (
    invitation.status === "EXPIRED" ||
    invitation.expiresAt.getTime() <= Date.now()
  ) {
    if (invitation.status === "PENDING") {
      await prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
    }
    throw new InvitationError("Invitation has expired.");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.acceptingUserId },
  });
  if (user.email.trim().toLowerCase() !== invitation.email.toLowerCase()) {
    throw new InvitationError(
      "Invitation email does not match the accepting user.",
    );
  }

  const org = await prisma.organization.findFirst({
    where: { id: invitation.organizationId, status: "ACTIVE" },
  });
  if (!org) {
    throw new InvitationError("Organization no longer exists.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
    });
    if (existing) {
      throw new InvitationError("User is already a member of this organization.");
    }

    await tx.organizationMembership.create({
      data: {
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
      },
    });

    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
  });

  await ensureOrganizationPolicies(invitation.organizationId);

  const { recordAdminAuditEvent } = await import("@/lib/auth/audit");
  await recordAdminAuditEvent({
    action: "ORGANIZATION_INVITATION_ACCEPTED",
    actorUserId: user.id,
    organizationId: invitation.organizationId,
    metadata: { invitationId: invitation.id },
  });

  return {
    organizationId: invitation.organizationId,
    role: invitation.role,
  };
}

export async function revokeOrganizationInvitation(input: {
  organizationId: string;
  invitationId: string;
  actorUserId: string;
}): Promise<void> {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.actorUserId,
      },
    },
  });
  if (!membership || !canManageInvitations(membership.role)) {
    throw new AuthorizationError(
      "Only OWNER or ADMIN can revoke invitations.",
    );
  }

  const invitation = await prisma.organizationInvitation.findFirst({
    where: {
      id: input.invitationId,
      organizationId: input.organizationId,
    },
  });
  if (!invitation) {
    throw new InvitationError("Invitation not found.");
  }
  if (invitation.status !== "PENDING") {
    throw new InvitationError("Only pending invitations can be revoked.");
  }

  await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
  });
}

/**
 * Count OWNER memberships — used to prevent ownerless Organizations.
 */
export async function assertOrganizationHasOwner(
  organizationId: string,
): Promise<void> {
  const owners = await prisma.organizationMembership.count({
    where: { organizationId, role: "OWNER" },
  });
  if (owners < 1) {
    throw new AuthorizationError(
      "Organization must retain at least one OWNER.",
    );
  }
}
