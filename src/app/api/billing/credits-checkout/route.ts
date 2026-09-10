import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authz";
import { createCompanyCreditsCheckoutSession } from "@/lib/billing/create-company-credits-checkout";

/**
 * POST /api/billing/credits-checkout — one-time Checkout for N×100 company blocks.
 * Line item uses adjustable_quantity (1–50). Grant math reads session quantity on webhook.
 */
export async function POST(request: Request) {
  try {
    const { organization, user } = await requireOrgAdmin();
    let initialBlocks = 1;
    try {
      const body = (await request.json()) as { blocks?: unknown };
      if (typeof body.blocks === "number" && Number.isFinite(body.blocks)) {
        initialBlocks = body.blocks;
      }
    } catch {
      // empty body is fine — default 1 block
    }

    const result = await createCompanyCreditsCheckoutSession({
      organizationId: organization.id,
      actorUserId: user.id,
      initialBlocks,
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
      error instanceof Error ? error.message : "Credits checkout unavailable";
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
