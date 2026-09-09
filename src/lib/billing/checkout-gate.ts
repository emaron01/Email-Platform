/**
 * Redirect self-serve UNPAID orgs to onboarding subscribe until Checkout completes.
 * Comped orgs never hit this.
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requiresStripeCheckout } from "@/lib/billing/billing-state";
import { ONBOARDING_SUBSCRIBE_PATH } from "@/lib/billing/paths";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export { ONBOARDING_SUBSCRIBE_PATH } from "@/lib/billing/paths";

const CHECKOUT_EXEMPT_PREFIXES = [
  ONBOARDING_SUBSCRIBE_PATH,
  "/settings/account",
  "/api/billing/checkout",
  "/api/billing/portal",
  "/no-workspace",
] as const;

function isCheckoutExempt(pathname: string): boolean {
  return CHECKOUT_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function enforceSelfServeCheckoutGate(): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;

  const pathname = (await headers()).get("x-pathname")?.trim() || "";
  if (pathname && isCheckoutExempt(pathname)) return;

  const billing = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: organization.id },
    select: {
      planCode: true,
      billingStatus: true,
      stripeSubscriptionId: true,
    },
  });
  if (!billing || !requiresStripeCheckout(billing)) return;

  if (!pathname || !isCheckoutExempt(pathname)) {
    redirect(ONBOARDING_SUBSCRIBE_PATH);
  }
}
