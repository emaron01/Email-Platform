/**
 * Apply plan entitlements from catalog onto UsagePolicy / ResearchPolicy.
 * Raises company-limit floor to plan value; never lowers a higher ops override.
 * Does not use Stripe dollar amounts.
 */
import "server-only";

import { getPlanDefinition } from "@/lib/billing/plans";
import {
  DEFAULT_RESEARCH_POLICY_VALUES,
  DEFAULT_USAGE_POLICY_VALUES,
} from "@/lib/usage/defaults";
import { prisma } from "@/lib/prisma";

export async function applyPlanEntitlements(input: {
  organizationId: string;
  planCode: string;
}): Promise<void> {
  const plan = getPlanDefinition(input.planCode);
  if (!plan) return;

  const entitlements = plan.entitlements;
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
