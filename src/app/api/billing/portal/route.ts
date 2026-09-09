import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authz";
import { createBillingPortalSession } from "@/lib/billing/create-portal-session";

/**
 * POST /api/billing/portal — Stripe Customer Portal session.
 * return_url is built from APP_URL (see createBillingPortalSession).
 */
export async function POST() {
  try {
    const { organization } = await requireOrgAdmin();
    const result = await createBillingPortalSession({
      organizationId: organization.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 },
      );
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Portal unavailable";
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
