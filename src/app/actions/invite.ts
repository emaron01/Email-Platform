"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import {
  acceptOrganizationInvitation,
  InvitationError,
} from "@/lib/org/signup";

export type AcceptInviteActionResult = {
  ok: boolean;
  message: string;
};

/**
 * Accept an organization invitation by raw token from the email link.
 * Must run as a Server Action (not during RSC page render) so cookies /
 * redirects are legal and the token lookup always completes.
 */
export async function acceptInviteAction(
  _prev: AcceptInviteActionResult | null,
  formData: FormData,
): Promise<AcceptInviteActionResult> {
  const rawToken = String(formData.get("token") || "").trim();
  if (!rawToken) {
    return { ok: false, message: "This invitation link is missing a token." };
  }

  try {
    const user = await requireCurrentUser();
    await acceptOrganizationInvitation({
      rawToken,
      acceptingUserId: user.id,
    });
  } catch (error) {
    if (error instanceof InvitationError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof Error && error.message.length <= 240) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Unable to accept this invitation." };
  }

  redirect("/");
}

/**
 * Sign out and return to login with `next` pointing back at the invite link,
 * so the invited person can sign in (or sign up) as the invited email.
 */
export async function logoutForInviteAction(formData: FormData): Promise<void> {
  const nextRaw = String(formData.get("next") || "").trim();
  const next =
    nextRaw.startsWith("/invite/accept") && !nextRaw.includes("//")
      ? nextRaw
      : "/invite/accept";

  const user = await requireCurrentUser().catch(() => null);
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
  redirect(`/login?next=${encodeURIComponent(next)}`);
}
