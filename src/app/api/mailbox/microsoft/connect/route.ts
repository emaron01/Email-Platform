import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { beginMicrosoftMailboxConnection } from "@/lib/mailbox/microsoft-oauth";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

export async function GET(request: Request) {
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    const returnPath = new URL(request.url).searchParams.get("returnTo");
    const authorizationUrl = await beginMicrosoftMailboxConnection({
      organizationId: organization.id,
      userId: user.id,
      returnPath,
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error("Failed to start Microsoft mailbox connection.", error);
    return NextResponse.redirect(
      new URL("/settings/email?error=connection_unavailable", request.url),
    );
  }
}
