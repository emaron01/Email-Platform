/**
 * Redirect self-serve UNPAID orgs to Billing until Checkout completes.
 * Comped orgs never hit this.
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requiresStripeCheckout } from "@/lib/billing/billing-state";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

const CHECKOUT_EXEMPT_PREFIXES = [
  "/settings/billing",
  "/settings/account",
  "/api/billing/checkout",
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

  // Unknown path still redirect — Billing is the only place to resume Checkout.
  if (!pathname || !isCheckoutExempt(pathname)) {
    redirect("/settings/billing?checkout=required");
  }
}
