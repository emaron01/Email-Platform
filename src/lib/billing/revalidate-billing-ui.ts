/**
 * Invalidate billing UI after Stripe syncs local state.
 */
import { revalidatePath } from "next/cache";

export function revalidateBillingUi(): void {
  revalidatePath("/settings/billing");
  revalidatePath("/onboarding/subscribe");
  // Checkout gate + plan labels live under the app layout.
  revalidatePath("/", "layout");
}
