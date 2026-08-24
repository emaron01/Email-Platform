import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { assertAccountCapability } from "@/lib/auth/account-policy";
import {
  completeMicrosoftMailboxConnection,
  MailboxConnectionError,
} from "@/lib/mailbox/microsoft-oauth";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

function errorCode(error: unknown): string {
  if (error instanceof MailboxConnectionError) {
    if (error.recovery === "ASK_ADMIN") return "admin_consent_required";
    if (error.recovery === "RECONNECT") return "reconnect_required";
  }
  return "connection_failed";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    const description =
      requestUrl.searchParams.get("error_description") ?? providerError;
    const adminConsent =
      /admin|consent_required|aadsts65001|aadsts90094/i.test(description);
    return NextResponse.redirect(
      new URL(
        `/settings/email?error=${adminConsent ? "admin_consent_required" : "connection_declined"}`,
        request.url,
      ),
    );
  }
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  if (!state || !code) {
    return NextResponse.redirect(
      new URL("/settings/email?error=invalid_callback", request.url),
    );
  }
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    assertAccountCapability(user, "OUTBOUND_EMAIL");
    const connected = await completeMicrosoftMailboxConnection({
      organizationId: organization.id,
      userId: user.id,
      state,
      code,
    });
    const destination = new URL(connected.returnPath, request.url);
    destination.searchParams.set("mailbox", "connected");
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("Failed to complete Microsoft mailbox connection.", error);
    return NextResponse.redirect(
      new URL(`/settings/email?error=${errorCode(error)}`, request.url),
    );
  }
}
