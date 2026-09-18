"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
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
