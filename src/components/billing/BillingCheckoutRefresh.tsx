"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * After Stripe Checkout returns, force a server re-fetch so plan/status
 * are not stuck on the pre-checkout RSC payload.
 */
export function BillingCheckoutRefresh({
  checkoutState,
}: {
  checkoutState: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (checkoutState === "success" || checkoutState === "required") {
      router.refresh();
    }
  }, [checkoutState, router]);

  return null;
}
