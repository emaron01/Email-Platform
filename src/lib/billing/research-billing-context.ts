/**
 * Load trial-aware billing fields for research UI (server-only).
 * Early convert is offered only to org admins (same as portal/checkout).
 */
import "server-only";

import {
  canManageOrganizationPolicy,
  getMembershipForCurrentUser,
} from "@/lib/auth/authz";
import { canOfferEarlyTrialConversion } from "@/lib/billing/end-trial-now";
import { prisma } from "@/lib/prisma";
import type { ResearchBillingContext } from "@/lib/usage/research-allowance";

export async function loadResearchBillingContext(
  organizationId: string,
): Promise<ResearchBillingContext> {
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
    select: {
      billingStatus: true,
      trialEndsAt: true,
    },
  });

  const billingStatus = profile?.billingStatus ?? "FREE";
  let canConvertTrialEarly = false;

  if (billingStatus === "TRIALING") {
    try {
      const { membership } = await getMembershipForCurrentUser(organizationId);
      if (canManageOrganizationPolicy(membership.role)) {
        canConvertTrialEarly =
          await canOfferEarlyTrialConversion(organizationId);
      }
    } catch {
      canConvertTrialEarly = false;
    }
  }

  return {
    billingStatus,
    trialEndsAt: profile?.trialEndsAt?.toISOString() ?? null,
    canConvertTrialEarly,
  };
}
