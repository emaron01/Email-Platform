/**
 * Apply plan entitlements from catalog onto UsagePolicy / ResearchPolicy.
 * Company limit: Math.max(existing, floor) — never lowers a platform-raised override
 * (including when a COMPED org converts to paid).
 * TRIALING uses trialEntitlements (25 companies); ACTIVE uses catalog (100).
 */
import "server-only";

import {
  getPlanDefinition,
  resolveEntitlementsForStatus,
} from "@/lib/billing/plans";
import {
  DEFAULT_RESEARCH_POLICY_VALUES,
  DEFAULT_USAGE_POLICY_VALUES,
} from "@/lib/usage/defaults";
import { prisma } from "@/lib/prisma";

export async function applyPlanEntitlements(input: {
  organizationId: string;
  planCode: string;
  billingStatus: string;
}): Promise<void> {
  const plan = getPlanDefinition(input.planCode);
  if (!plan) return;

  const entitlements = resolveEntitlementsForStatus({
    planCode: input.planCode,
    billingStatus: input.billingStatus,
  });
  if (!entitlements) return;

  const existing = await prisma.organizationUsagePolicy.findUnique({
    where: { organizationId: input.organizationId },
    select: { activeResearchedCompanyLimit: true },
  });

  const activeResearchedCompanyLimit = Math.max(
    existing?.activeResearchedCompanyLimit ?? 0,
    entitlements.activeResearchedCompanyLimit,
  );

  await prisma.organizationUsagePolicy.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit:
        DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit: entitlements.dailyEmailSendWarningLimit,
      dailyEmailSendLimit: DEFAULT_USAGE_POLICY_VALUES.dailyEmailSendLimit,
      monthlyEmailSendLimit: entitlements.monthlyEmailSendLimit,
      emailDeeplinkMaxUrlLength:
        DEFAULT_USAGE_POLICY_VALUES.emailDeeplinkMaxUrlLength,
    },
    update: {
      activeResearchedCompanyLimit,
      dailyEmailSendWarningLimit: entitlements.dailyEmailSendWarningLimit,
      monthlyEmailSendLimit: entitlements.monthlyEmailSendLimit,
    },
  });

  await prisma.researchPolicy.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      ...DEFAULT_RESEARCH_POLICY_VALUES,
      researchFreshnessDays: entitlements.researchFreshnessDays,
    },
    update: {
      researchFreshnessDays: entitlements.researchFreshnessDays,
    },
  });
}
