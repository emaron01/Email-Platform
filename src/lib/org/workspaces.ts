/**
 * Multi-workspace helpers (membership list + owned billed personal orgs).
 */
import "server-only";

import {
  BILLING_PLAN_COMPED,
  BILLING_PLAN_STANDARD,
  canonicalPlanCode,
} from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

export type WorkspaceOption = {
  organizationId: string;
  name: string;
  role: string;
  isActive: boolean;
};

/** Every org the user belongs to, for the workspace switcher. */
export async function listWorkspacesForUser(input: {
  userId: string;
  activeOrganizationId: string | null;
}): Promise<WorkspaceOption[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: input.userId },
    select: {
      role: true,
      organizationId: true,
      organization: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships
    .filter((m) => m.organization.status === "ACTIVE")
    .map((m) => ({
      organizationId: m.organization.id,
      name: m.organization.name,
      role: m.role,
      isActive: m.organization.id === input.activeOrganizationId,
    }));
}

export type OwnedBilledOrganization = {
  organizationId: string;
  name: string;
  planCode: string;
  billingStatus: string;
  stripeSubscriptionId: string;
};

const LIVE_BILLING_STATUSES = new Set([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
]);

/**
 * Personal (INDIVIDUAL) orgs the user OWNs that still have a live Standard
 * Stripe subscription, excluding the currently active workspace.
 * Used after joining a Team while still paying for a personal Standard.
 */
export async function listOwnedBilledOrganizationsAsideFrom(input: {
  userId: string;
  excludeOrganizationId: string | null;
}): Promise<OwnedBilledOrganization[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: input.userId,
      role: "OWNER",
      ...(input.excludeOrganizationId
        ? { organizationId: { not: input.excludeOrganizationId } }
        : {}),
    },
    select: {
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          accountType: true,
          billingProfile: {
            select: {
              planCode: true,
              billingStatus: true,
              stripeSubscriptionId: true,
            },
          },
        },
      },
    },
  });

  const out: OwnedBilledOrganization[] = [];
  for (const m of memberships) {
    const org = m.organization;
    if (org.accountType !== "INDIVIDUAL") continue;
    const billing = org.billingProfile;
    if (!billing?.stripeSubscriptionId) continue;
    const plan = canonicalPlanCode(billing.planCode);
    if (plan === BILLING_PLAN_COMPED || plan !== BILLING_PLAN_STANDARD) {
      continue;
    }
    if (!LIVE_BILLING_STATUSES.has(billing.billingStatus)) continue;
    out.push({
      organizationId: org.id,
      name: org.name,
      planCode: billing.planCode,
      billingStatus: billing.billingStatus,
      stripeSubscriptionId: billing.stripeSubscriptionId,
    });
  }
  return out;
}
