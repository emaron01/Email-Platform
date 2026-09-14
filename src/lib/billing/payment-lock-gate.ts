/**
 * Route-level payment lock — locked orgs may only use /settings/billing.
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getOrganizationPaymentLockState,
  PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES,
} from "@/lib/billing/payment-lock";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

function isPaymentLockRouteExempt(pathname: string): boolean {
  return PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Redirect locked orgs to billing. Login/read of other product routes is denied.
 * Billing APIs live outside (app) layout and remain reachable for Checkout/Portal.
 */
export async function enforcePaymentLockGate(): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;

  const pathname = (await headers()).get("x-pathname")?.trim() || "";
  if (pathname && isPaymentLockRouteExempt(pathname)) return;

  const { locked } = await getOrganizationPaymentLockState(organization.id);
  if (!locked) return;

  if (!pathname || !isPaymentLockRouteExempt(pathname)) {
    redirect("/settings/billing");
  }
}
