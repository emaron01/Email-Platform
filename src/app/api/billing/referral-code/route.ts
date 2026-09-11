import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/org/authz";
import { ensureOrganizationReferralCode } from "@/lib/billing/referrals";

/**
 * POST /api/billing/referral-code — lazy-create Individual referral promo code.
 */
export async function POST() {
  try {
    const { organization } = await requireOrgAdmin();
    const result = await ensureOrganizationReferralCode({
      organizationId: organization.id,
    });
    if (!result.ok) {
      const status =
        result.code === "NOT_INDIVIDUAL"
          ? 403
          : result.code === "STRIPE_NOT_CONFIGURED"
            ? 503
            : 400;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      code: result.code,
      successfulReferralCount: result.successfulReferralCount,
      rewardPercent: result.rewardPercent,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Referral code unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
