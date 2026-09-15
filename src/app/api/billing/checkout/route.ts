import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authz";
import { createPlanCheckoutSession } from "@/lib/billing/create-checkout-session";
import { BILLING_PLAN_STANDARD, BILLING_PLAN_TEAM } from "@/lib/billing/plans";

export async function POST(request: Request) {
  try {
    const { organization, user } = await requireOrgAdmin();
    let planCode: string = BILLING_PLAN_STANDARD;
    let seatQuantity = 1;
    try {
      const body = (await request.json()) as {
        planCode?: string;
        seatQuantity?: number;
      };
      if (body.planCode === BILLING_PLAN_TEAM) {
        planCode = BILLING_PLAN_TEAM;
      }
      if (
        typeof body.seatQuantity === "number" &&
        Number.isFinite(body.seatQuantity)
      ) {
        seatQuantity = body.seatQuantity;
      }
    } catch {
      // Empty body → Standard, quantity 1
    }

    const result = await createPlanCheckoutSession({
      organizationId: organization.id,
      actorUserId: user.id,
      actorEmail: user.email,
      planCode,
      seatQuantity,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.code === "ALREADY_SUBSCRIBED" ? 409 : 400 },
      );
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout unavailable";
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
