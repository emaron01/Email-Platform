/**
 * Company research credit packs — one-time purchases, 12-month expiry.
 * Effective allowance = plan base (UsagePolicy.activeResearchedCompanyLimit)
 * + sum(quantity) for rows with expiresAt > now.
 */
import {
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

export async function listActiveCompanyResearchCredits(
  organizationId: string,
  now: Date = new Date(),
): Promise<CompanyResearchCreditRow[]> {
  const { prisma } = await import("@/lib/prisma");
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
 * Duplicate Stripe ids return the existing row without adding capacity twice.
 */
export async function grantCompanyResearchCredits(input: {
  organizationId: string;
  quantity?: number;
  grantedAt?: Date;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<{ created: boolean; credit: CompanyResearchCreditRow }> {
  const { prisma } = await import("@/lib/prisma");
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
      return {
        created: false,
        credit: {
          id: existing.id,
          quantity: existing.quantity,
          grantedAt: existing.grantedAt,
          expiresAt: existing.expiresAt,
        },
      };
    }
  }
  if (input.stripePaymentIntentId) {
    const existing = await prisma.companyResearchCredit.findUnique({
      where: { stripePaymentIntentId: input.stripePaymentIntentId },
    });
    if (existing) {
      return {
        created: false,
        credit: {
          id: existing.id,
          quantity: existing.quantity,
          grantedAt: existing.grantedAt,
          expiresAt: existing.expiresAt,
        },
      };
    }
  }

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

  return {
    created: true,
    credit: {
      id: created.id,
      quantity: created.quantity,
      grantedAt: created.grantedAt,
      expiresAt: created.expiresAt,
    },
  };
}

export {
  creditExpiryDate,
  effectiveCompanyResearchLimit,
  nextCreditExpiry,
  sumActiveCreditCompanies,
};
