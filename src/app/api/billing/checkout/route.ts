import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authz";
import { createStandardCheckoutSession } from "@/lib/billing/create-checkout-session";

export async function POST() {
  try {
    const { organization, user } = await requireOrgAdmin();
    const result = await createStandardCheckoutSession({
      organizationId: organization.id,
      actorUserId: user.id,
      actorEmail: user.email,
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
