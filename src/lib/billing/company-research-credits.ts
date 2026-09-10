/**
 * Company research credit packs — one-time purchases, 12-month expiry.
 * Effective allowance = plan base (UsagePolicy.activeResearchedCompanyLimit)
 * + sum(quantity) for rows with expiresAt > now.
 *
 * Node-safe (no server-only). Research workers evaluate allowance here;
 * must use prisma-client, never the Next-only `@/lib/prisma` wrapper.
 */
import { prisma } from "@/lib/prisma-client";
import {
  companiesFromCreditCheckoutBlocks,
  effectiveCompanyResearchLimit,
  nextCreditExpiry,
  sumActiveCreditCompanies,
} from "@/lib/billing/company-research-credits-math";
import {
  COMPANY_CREDIT_BLOCK,
  creditExpiryDate,
} from "@/lib/billing/plans";

export type CompanyResearchCreditRow = {
  id: string;
  quantity: number;
  grantedAt: Date;
  expiresAt: Date;
};

export type CompanyResearchCreditBalance = {
  /** Unexpired credit companies still available to the allowance. */
  activeCreditCompanies: number;
  /** Individual unexpired packs (soonest expiry first). */
  packs: CompanyResearchCreditRow[];
  /** Soonest expiry among active packs, if any. */
  nextExpiresAt: Date | null;
};

function toRow(existing: {
  id: string;
  quantity: number;
  grantedAt: Date;
  expiresAt: Date;
}): CompanyResearchCreditRow {
  return {
    id: existing.id,
    quantity: existing.quantity,
    grantedAt: existing.grantedAt,
    expiresAt: existing.expiresAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      String((error as { code?: unknown }).code) === "P2002",
  );
}

export async function listActiveCompanyResearchCredits(
  organizationId: string,
  now: Date = new Date(),
): Promise<CompanyResearchCreditRow[]> {
  const rows = await prisma.companyResearchCredit.findMany({
    where: {
      organizationId,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "asc" },
    select: {
      id: true,
      quantity: true,
      grantedAt: true,
      expiresAt: true,
    },
  });
  return rows;
}

export async function getCompanyResearchCreditBalance(
  organizationId: string,
  now: Date = new Date(),
): Promise<CompanyResearchCreditBalance> {
  const packs = await listActiveCompanyResearchCredits(organizationId, now);
  return {
    activeCreditCompanies: sumActiveCreditCompanies(packs, now),
    packs,
    nextExpiresAt: nextCreditExpiry(packs, now),
  };
}

/**
 * Plan base slots + unexpired purchased credit companies.
 * Does not mutate UsagePolicy — credits are layered on top.
 */
export async function getEffectiveCompanyResearchAllowance(input: {
  organizationId: string;
  baseLimit: number;
  now?: Date;
}): Promise<{
  baseLimit: number;
  creditCompanies: number;
  effectiveLimit: number;
  nextCreditExpiresAt: Date | null;
}> {
  const now = input.now ?? new Date();
  const balance = await getCompanyResearchCreditBalance(
    input.organizationId,
    now,
  );
  return {
    baseLimit: input.baseLimit,
    creditCompanies: balance.activeCreditCompanies,
    effectiveLimit: effectiveCompanyResearchLimit(
      input.baseLimit,
      balance.packs,
      now,
    ),
    nextCreditExpiresAt: balance.nextExpiresAt,
  };
}

/**
 * Idempotent grant after a successful one-time Checkout/PaymentIntent.
 * `quantity` is company slots (e.g. 300 for 3×100 blocks), not block count.
 * Duplicate Stripe ids return the existing row without adding capacity twice.
 */
export async function grantCompanyResearchCredits(input: {
  organizationId: string;
  quantity?: number;
  grantedAt?: Date;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<{ created: boolean; credit: CompanyResearchCreditRow }> {
  const quantity = input.quantity ?? COMPANY_CREDIT_BLOCK.units;
  const grantedAt = input.grantedAt ?? new Date();
  const expiresAt = creditExpiryDate(
    grantedAt,
    COMPANY_CREDIT_BLOCK.expiryMonths,
  );

  if (input.stripeCheckoutSessionId) {
    const existing = await prisma.companyResearchCredit.findUnique({
      where: { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
    });
    if (existing) {
      return { created: false, credit: toRow(existing) };
    }
  }
  if (input.stripePaymentIntentId) {
    const existing = await prisma.companyResearchCredit.findUnique({
      where: { stripePaymentIntentId: input.stripePaymentIntentId },
    });
    if (existing) {
      return { created: false, credit: toRow(existing) };
    }
  }

  try {
    const created = await prisma.companyResearchCredit.create({
      data: {
        organizationId: input.organizationId,
        quantity,
        grantedAt,
        expiresAt,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      },
    });

    return { created: true, credit: toRow(created) };
  } catch (error) {
    // Concurrent webhook / replay lost the race on unique Stripe ids.
    if (!isUniqueViolation(error)) throw error;

    if (input.stripeCheckoutSessionId) {
      const existing = await prisma.companyResearchCredit.findUnique({
        where: { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
      });
      if (existing) return { created: false, credit: toRow(existing) };
    }
    if (input.stripePaymentIntentId) {
      const existing = await prisma.companyResearchCredit.findUnique({
        where: { stripePaymentIntentId: input.stripePaymentIntentId },
      });
      if (existing) return { created: false, credit: toRow(existing) };
    }
    throw error;
  }
}

export {
  companiesFromCreditCheckoutBlocks,
  effectiveCompanyResearchLimit,
  nextCreditExpiry,
  sumActiveCreditCompanies,
} from "@/lib/billing/company-research-credits-math";
export { creditExpiryDate } from "@/lib/billing/plans";
