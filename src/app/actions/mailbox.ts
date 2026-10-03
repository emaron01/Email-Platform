"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { assertMicrosoft365SendingAvailable } from "@/lib/mailbox/availability-access";
import { disconnectMicrosoftMailbox } from "@/lib/mailbox/microsoft-oauth";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

export type MailboxConnectionActionResult = {
  ok: boolean;
  message: string;
};

export async function disconnectMicrosoftMailboxAction(
  _previous: MailboxConnectionActionResult | null,
  _formData: FormData,
): Promise<MailboxConnectionActionResult> {
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    await assertMicrosoft365SendingAvailable(organization.id);
    await disconnectMicrosoftMailbox({
      organizationId: organization.id,
      userId: user.id,
    });
    revalidatePath("/settings/email");
    return {
      ok: true,
      message: "Microsoft 365 mailbox disconnected.",
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error("Failed to disconnect Microsoft mailbox.", error);
    return {
      ok: false,
      message: "The mailbox could not be disconnected. Try again.",
    };
  }
}
