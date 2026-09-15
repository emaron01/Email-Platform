/**
 * Route-level payment lock:
 * - Full lock: redirect to /settings/billing (views closed).
 * - PAST_DUE grace: views stay open; Server Actions refused (read-only).
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  NEXT_ACTION_HEADER,
  PaymentLockError,
  getOrganizationPaymentLockState,
  isPaymentLockPathExempt,
  paymentLockUserMessage,
  PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES,
} from "@/lib/billing/payment-lock";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

function isPaymentLockRouteExempt(pathname: string): boolean {
  return PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Locked orgs → billing only.
 * Grace orgs → allow GETs; refuse Server Actions outside billing pay paths.
 */
export async function enforcePaymentLockGate(): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;

  const h = await headers();
  const pathname = h.get("x-pathname")?.trim() || "";
  if (pathname && isPaymentLockRouteExempt(pathname)) return;

  const { locked, spendBlocked, profile } =
    await getOrganizationPaymentLockState(organization.id);

  if (locked) {
    if (!pathname || !isPaymentLockRouteExempt(pathname)) {
      redirect("/settings/billing");
    }
    return;
  }

  // PAST_DUE grace (and any spendBlocked without full route lock): read-only.
  if (!spendBlocked || !profile) return;
  if (!h.get(NEXT_ACTION_HEADER)) return;
  if (pathname && isPaymentLockPathExempt(pathname)) return;

  throw new PaymentLockError(
    paymentLockUserMessage(profile),
    profile.lockReason ?? profile.billingStatus,
  );
}
