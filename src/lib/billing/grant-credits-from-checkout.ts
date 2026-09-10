/**
 * Grant company research credits from a completed one-time Checkout Session.
 * Reads line-item quantity (blocks) × unitsPerBlock → one CompanyResearchCredit row.
 * Idempotent on checkout session id and payment intent id.
 */
import "server-only";

import type Stripe from "stripe";
import { companiesFromCreditCheckoutBlocks } from "@/lib/billing/company-research-credits-math";
import { grantCompanyResearchCredits } from "@/lib/billing/company-research-credits";
import {
  COMPANY_CREDIT_BLOCK,
  resolveStripePriceId,
} from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

export type GrantCreditsFromCheckoutResult =
  | {
      ok: true;
      organizationId: string;
      created: boolean;
      companiesGranted: number;
      blocks: number;
    }
  | { ok: false; reason: string };

function paymentIntentIdFromSession(
  session: Stripe.Checkout.Session,
): string | null {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }
  return session.payment_intent?.id ?? null;
}

export async function resolveOrganizationIdForCreditCheckout(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const fromMeta = session.metadata?.organizationId?.trim() || null;
  if (fromMeta) return fromMeta;

  const fromRef = session.client_reference_id?.trim() || null;
  if (fromRef) return fromRef;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (!customerId) return null;

  const byCustomer = await prisma.organizationBillingProfile.findFirst({
    where: { stripeCustomerId: customerId },
    select: { organizationId: true },
  });
  return byCustomer?.organizationId ?? null;
}

/**
 * Pull purchased block count from Checkout line items for our credit price.
 * Falls back to session metadata / quantity 1 when the price line is missing.
 */
export async function resolveCreditCheckoutBlocks(
  session: Stripe.Checkout.Session,
): Promise<number> {
  const creditPriceId = resolveStripePriceId(
    COMPANY_CREDIT_BLOCK.stripePriceIdEnv,
  );
  const stripe = getStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 20,
  });

  if (creditPriceId) {
    const match = lineItems.data.find((item) => item.price?.id === creditPriceId);
    if (match?.quantity != null && match.quantity > 0) {
      return match.quantity;
    }
  }

  // Single-line credit sessions: use the only line quantity.
  if (lineItems.data.length === 1) {
    const qty = lineItems.data[0]?.quantity;
    if (qty != null && qty > 0) return qty;
  }

  return 1;
}

export async function grantCreditsFromCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<GrantCreditsFromCheckoutResult> {
  if (session.mode !== "payment") {
    return { ok: false, reason: "not_payment_mode" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }

  const purpose = session.metadata?.purpose?.trim();
  if (purpose && purpose !== "company_research_credits") {
    return { ok: false, reason: "wrong_purpose" };
  }

  const organizationId = await resolveOrganizationIdForCreditCheckout(session);
  if (!organizationId) {
    return { ok: false, reason: "organization_not_found" };
  }

  // If purpose metadata is missing (e.g. Dashboard Payment Link), still grant when
  // the session contains our configured credit price.
  if (!purpose) {
    const creditPriceId = resolveStripePriceId(
      COMPANY_CREDIT_BLOCK.stripePriceIdEnv,
    );
    if (!creditPriceId) {
      return { ok: false, reason: "price_not_configured" };
    }
    const stripe = getStripe();
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 20,
    });
    const hasCreditPrice = lineItems.data.some(
      (item) => item.price?.id === creditPriceId,
    );
    if (!hasCreditPrice) {
      return { ok: false, reason: "not_credit_checkout" };
    }
  }

  const blocks = await resolveCreditCheckoutBlocks(session);
  const companiesGranted = companiesFromCreditCheckoutBlocks(
    blocks,
    COMPANY_CREDIT_BLOCK.units,
  );
  if (companiesGranted <= 0) {
    return { ok: false, reason: "zero_quantity" };
  }

  const result = await grantCompanyResearchCredits({
    organizationId,
    quantity: companiesGranted,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentIdFromSession(session),
  });

  return {
    ok: true,
    organizationId,
    created: result.created,
    companiesGranted: result.credit.quantity,
    blocks,
  };
}
