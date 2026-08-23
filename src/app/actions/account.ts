"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { requireCurrentUser } from "@/lib/auth/authz";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { sendTransactionalEmail } from "@/lib/transactional-email/send";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, RateLimitError } from "@/lib/auth/rate-limit";

export async function logoutAction(): Promise<void> {
  // Capture actor before Better Auth invalidates the session cookie.
  const user = await requireCurrentUser().catch(() => null);

  // Authoritative session termination — Better Auth clears/invalidates cookies.
  // Do not delete cookies manually.
  await auth.api.signOut({
    headers: await headers(),
  });

  if (user) {
    await recordAdminAuditEvent({
      action: "LOGOUT",
      actorUserId: user.id,
      organizationId: user.activeOrganizationId,
    });
  }
  redirect("/login");
}

export type AccountActionResult = {
  ok: boolean;
  message: string;
};

export async function changePasswordAction(
  _prev: AccountActionResult | null,
  formData: FormData,
): Promise<AccountActionResult> {
  try {
    const user = await requireCurrentUser();
    await assertRateLimit({
      key: `password-change:${user.id}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    if (newPassword.length < 10) {
      return { ok: false, message: "Password must be at least 10 characters." };
    }

    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });

    await recordAdminAuditEvent({
      action: "PASSWORD_CHANGED",
      actorUserId: user.id,
      organizationId: user.activeOrganizationId,
    });

    const org = user.activeOrganizationId
      ? await prisma.organization.findUnique({
          where: { id: user.activeOrganizationId },
        })
      : null;

    await sendTransactionalEmail({
      templateKey: "PASSWORD_CHANGED",
      to: user.email,
      userId: user.id,
      organizationId: user.activeOrganizationId,
      variables: {
        firstName: user.firstName || "there",
        workspaceName: org?.name || "your workspace",
      },
    });

    return { ok: true, message: "Password updated." };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, message: error.message };
    }
    const message =
      error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("invalid") ||
      message.includes("incorrect") ||
      message.includes("credential") ||
      message.includes("password")
    ) {
      return {
        ok: false,
        message: "Current password is incorrect or the change was rejected.",
      };
    }
    return {
      ok: false,
      message: "Unable to update password. Please try again.",
    };
  }
}
