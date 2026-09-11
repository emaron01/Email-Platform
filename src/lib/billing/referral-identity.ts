/**
 * Self-referral guards and org email snapshots for referral attribution.
 */
import "server-only";

import { normalizeEmail } from "@/lib/auth/provision-service";
import { prisma } from "@/lib/prisma";

export type OrgReferralIdentity = {
  organizationId: string;
  ownerEmailNormalized: string | null;
  billingEmailNormalized: string | null;
};

export async function loadOrgReferralIdentity(
  organizationId: string,
): Promise<OrgReferralIdentity> {
  const [owner, billing] = await Promise.all([
    prisma.organizationMembership.findFirst({
      where: { organizationId, role: "OWNER" },
      select: { user: { select: { emailNormalized: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationBillingProfile.findUnique({
      where: { organizationId },
      select: { billingEmail: true },
    }),
  ]);

  const ownerEmail =
    owner?.user.emailNormalized?.trim() ||
    (owner?.user.email ? normalizeEmail(owner.user.email) : null) ||
    null;
  const billingEmail = billing?.billingEmail
    ? normalizeEmail(billing.billingEmail)
    : null;

  return {
    organizationId,
    ownerEmailNormalized: ownerEmail,
    billingEmailNormalized: billingEmail,
  };
}

export type SelfReferralCheckInput = {
  referrer: OrgReferralIdentity;
  referee: OrgReferralIdentity;
  /** Checkout / Stripe customer email when available. */
  checkoutEmailNormalized?: string | null;
};

/**
 * Blocks self-referral when:
 * 1. Same organization id
 * 2. Same OWNER emailNormalized (covers delete + re-signup with same email)
 * 3. Same billing email (when both present)
 * 4. Checkout customer email matches referrer owner or billing email
 */
export function selfReferralBlockReason(
  input: SelfReferralCheckInput,
): string | null {
  if (input.referrer.organizationId === input.referee.organizationId) {
    return "Self-referral blocked: same organization.";
  }

  const referrerEmails = new Set(
    [
      input.referrer.ownerEmailNormalized,
      input.referrer.billingEmailNormalized,
    ].filter((value): value is string => Boolean(value)),
  );
  const refereeEmails = new Set(
    [
      input.referee.ownerEmailNormalized,
      input.referee.billingEmailNormalized,
      input.checkoutEmailNormalized ?? null,
    ].filter((value): value is string => Boolean(value)),
  );

  for (const email of refereeEmails) {
    if (referrerEmails.has(email)) {
      return "Self-referral blocked: matching account email.";
    }
  }

  return null;
}
