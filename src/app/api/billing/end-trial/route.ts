import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authz";
import { endTrialNow } from "@/lib/billing/end-trial-now";

/**
 * POST /api/billing/end-trial — Stripe trial_end: 'now'.
 * Local ACTIVE + 100-company entitlement arrive via customer.subscription.updated webhook
 * (syncOrganizationFromStripeSubscription → applyPlanEntitlements), not in this handler.
 */
export async function POST() {
  try {
    const { organization } = await requireOrgAdmin();
    const result = await endTrialNow({ organizationId: organization.id });

    if (!result.ok) {
      const status =
        result.code === "NOT_TRIALING" || result.code === "NO_PAYMENT_METHOD"
          ? 409
          : 400;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      subscriptionId: result.subscriptionId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "End trial unavailable";
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
