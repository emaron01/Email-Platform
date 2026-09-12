/**
 * Apply plan entitlements onto UsagePolicy / ResearchPolicy (Stripe webhook sync).
 * Floors come from billing.catalog when present, else plans.ts.
 * Company limit: Math.max(existing, floor) — never lowers a platform-raised override.
 */
import "server-only";

import { getPlanDefinition } from "@/lib/billing/plans";
import { resolveCatalogEntitlementsForStatus } from "@/lib/billing/billing-catalog";
import { loadEffectiveBillingCatalog } from "@/lib/billing/effective-catalog";
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

  const { catalog } = await loadEffectiveBillingCatalog();
  const entitlements = resolveCatalogEntitlementsForStatus({
    catalog,
    planCode: input.planCode,
    billingStatus: input.billingStatus,
  });
  if (!entitlements) return;

  const existing = await prisma.organizationUsagePolicy.findUnique({
    where: { organizationId: input.organizationId },
    select: {
      activeResearchedCompanyLimit: true,
      dailyEmailGenerationLimit: true,
    },
  });

  const activeResearchedCompanyLimit = Math.max(
    existing?.activeResearchedCompanyLimit ?? 0,
    entitlements.activeResearchedCompanyLimit,
  );

  // Generation ceiling: take catalog floor; never lower an existing higher override.
  const dailyEmailGenerationLimit = Math.max(
    existing?.dailyEmailGenerationLimit ?? 0,
    entitlements.dailyAiGenerationLimit,
  );

  await prisma.organizationUsagePolicy.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit: entitlements.dailyEmailSendWarningLimit,
      dailyEmailSendLimit: DEFAULT_USAGE_POLICY_VALUES.dailyEmailSendLimit,
      monthlyEmailSendLimit: entitlements.monthlyEmailSendLimit,
      emailDeeplinkMaxUrlLength:
        DEFAULT_USAGE_POLICY_VALUES.emailDeeplinkMaxUrlLength,
    },
    update: {
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
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
