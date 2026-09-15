import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/auth/authz";
import { addSeatToSubscription } from "@/lib/billing/add-seat";
import {
  PaymentLockError,
  assertOrganizationNotPaymentLocked,
} from "@/lib/billing/payment-lock";
import { revalidatePath } from "next/cache";

export async function POST() {
  try {
    const { organization } = await requireOrgAdmin();
    await assertOrganizationNotPaymentLocked(organization.id);
    const result = await addSeatToSubscription({
      organizationId: organization.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 },
      );
    }

    revalidatePath("/settings/organization");
    revalidatePath("/settings/billing");
    return NextResponse.json({ seatQuantity: result.seatQuantity });
  } catch (error) {
    if (error instanceof PaymentLockError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unable to add seat";
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
