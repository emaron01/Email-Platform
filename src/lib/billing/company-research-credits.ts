/**
 * Company research credit packs — one-time purchases, 12-month expiry.
 * Effective allowance = plan base (UsagePolicy.activeResearchedCompanyLimit)
 * + sum(quantity) for rows with expiresAt > now.
 *
 * Standard: packs are organization-scoped (userId null).
 * Team/Enterprise: packs are attributed to a user and stack on that user's
 * first-introducer allowance only.
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
  userId: string | null;
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
  userId?: string | null;
}): CompanyResearchCreditRow {
  return {
    id: existing.id,
    quantity: existing.quantity,
    grantedAt: existing.grantedAt,
    expiresAt: existing.expiresAt,
    userId: existing.userId ?? null,
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

/**
 * Active packs for an org. When `userId` is set, only that user's packs.
 * When `userId` is null, only organization-scoped packs (Standard).
 * Omit `userId` to include every pack on the org (platform listing).
 */
export async function listActiveCompanyResearchCredits(
  organizationId: string,
  now: Date = new Date(),
  options?: { userId?: string | null },
): Promise<CompanyResearchCreditRow[]> {
  const userFilter =
    options && "userId" in options
      ? options.userId
        ? { userId: options.userId }
        : { userId: null }
      : {};

  const rows = await prisma.companyResearchCredit.findMany({
    where: {
      organizationId,
      expiresAt: { gt: now },
      ...userFilter,
    },
    orderBy: { expiresAt: "asc" },
    select: {
      id: true,
      quantity: true,
      grantedAt: true,
      expiresAt: true,
      userId: true,
    },
  });
  return rows.map(toRow);
}

export async function getCompanyResearchCreditBalance(
  organizationId: string,
  now: Date = new Date(),
  options?: { userId?: string | null },
): Promise<CompanyResearchCreditBalance> {
  const packs = await listActiveCompanyResearchCredits(
    organizationId,
    now,
    options,
  );
  return {
    activeCreditCompanies: sumActiveCreditCompanies(packs, now),
    packs,
    nextExpiresAt: nextCreditExpiry(packs, now),
  };
}

/**
 * Plan base slots + unexpired purchased credit companies.
 * Does not mutate UsagePolicy — credits are layered on top.
 * Pass `userId` for Team/Enterprise personal packs; omit/null for Standard org pool.
 */
export async function getEffectiveCompanyResearchAllowance(input: {
  organizationId: string;
  baseLimit: number;
  userId?: string | null;
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
    "userId" in input ? { userId: input.userId ?? null } : { userId: null },
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
 * Set `userId` for Team/Enterprise personal attribution; leave null for Standard.
 */
export async function grantCompanyResearchCredits(input: {
  organizationId: string;
  userId?: string | null;
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
  const userId = input.userId?.trim() || null;

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
        userId,
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

/**
 * Option 2: on resubscribe after CANCELED, add locked duration to pack expiry.
 * Extends packs that still had remaining life at canceledAt (including those that
 * would have expired during the lapse). Idempotent when only run on CANCELED→live.
 */
export async function extendCompanyResearchCreditsAfterCancelLapse(input: {
  organizationId: string;
  canceledAt: Date;
  now?: Date;
}): Promise<{ extendedPackCount: number; extensionMs: number }> {
  const now = input.now ?? new Date();
  const extensionMs = Math.max(0, now.getTime() - input.canceledAt.getTime());
  if (extensionMs <= 0) {
    return { extendedPackCount: 0, extensionMs: 0 };
  }

  const packs = await prisma.companyResearchCredit.findMany({
    where: {
      organizationId: input.organizationId,
      expiresAt: { gt: input.canceledAt },
    },
    select: { id: true, expiresAt: true },
  });

  for (const pack of packs) {
    await prisma.companyResearchCredit.update({
      where: { id: pack.id },
      data: { expiresAt: new Date(pack.expiresAt.getTime() + extensionMs) },
    });
  }

  return { extendedPackCount: packs.length, extensionMs };
}

export {
  companiesFromCreditCheckoutBlocks,
  effectiveCompanyResearchLimit,
  nextCreditExpiry,
  sumActiveCreditCompanies,
};
