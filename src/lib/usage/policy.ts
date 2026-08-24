import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_RESEARCH_POLICY_VALUES,
  DEFAULT_USAGE_POLICY_VALUES,
} from "@/lib/usage/defaults";

export type PolicySource = "ORGANIZATION" | "USER_OVERRIDE";

export type EffectiveUsagePolicy = {
  activeResearchedCompanyLimit: number;
  dailyEmailGenerationLimit: number;
  dailyEmailSendWarningLimit: number;
  dailyEmailSendLimit: number;
  emailDeeplinkMaxUrlLength: number;
  sources: {
    activeResearchedCompanyLimit: PolicySource;
    dailyEmailGenerationLimit: PolicySource;
    dailyEmailSendWarningLimit: PolicySource;
    dailyEmailSendLimit: PolicySource;
    emailDeeplinkMaxUrlLength: PolicySource;
  };
};

export type ResearchPolicyResolved = {
  maxSearchQueriesPerCompany: number;
  maxSourcesPerCompany: number;
  researchFreshnessDays: number;
  maxSearchQueriesPerContact: number;
  maxSourcesPerContact: number;
  contactResearchFreshnessDays: number;
  productSourceResearchFreshnessDays: number;
  maxSearchQueriesPerProduct: number;
  maxSourcesPerProduct: number;
  maxSearchQueriesPerPersona: number;
  maxSourcesPerPersona: number;
  personaResearchFreshnessDays: number;
  maxProjectedPersonaCriteria: number;
  maxTargetedSearchCriteriaPerIcp: number;
};

/**
 * Ensures OrganizationUsagePolicy + ResearchPolicy rows exist.
 * Uses database defaults from DEFAULT_* only at creation time.
 */
export async function ensureOrganizationPolicies(
  organizationId: string,
): Promise<void> {
  await prisma.organizationUsagePolicy.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      activeResearchedCompanyLimit:
        DEFAULT_USAGE_POLICY_VALUES.activeResearchedCompanyLimit,
      dailyEmailGenerationLimit:
        DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit:
        DEFAULT_USAGE_POLICY_VALUES.dailyEmailSendWarningLimit,
      dailyEmailSendLimit: DEFAULT_USAGE_POLICY_VALUES.dailyEmailSendLimit,
      emailDeeplinkMaxUrlLength:
        DEFAULT_USAGE_POLICY_VALUES.emailDeeplinkMaxUrlLength,
    },
  });

  await prisma.researchPolicy.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      maxSearchQueriesPerCompany:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
      maxSourcesPerCompany: DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
      researchFreshnessDays:
        DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
      maxSearchQueriesPerContact:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerContact,
      maxSourcesPerContact:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerContact,
      contactResearchFreshnessDays:
        DEFAULT_RESEARCH_POLICY_VALUES.contactResearchFreshnessDays,
      productSourceResearchFreshnessDays:
        DEFAULT_RESEARCH_POLICY_VALUES.productSourceResearchFreshnessDays,
      maxSearchQueriesPerProduct:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerProduct,
      maxSourcesPerProduct:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerProduct,
      maxSearchQueriesPerPersona:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerPersona,
      maxSourcesPerPersona:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerPersona,
      personaResearchFreshnessDays:
        DEFAULT_RESEARCH_POLICY_VALUES.personaResearchFreshnessDays,
      maxProjectedPersonaCriteria:
        DEFAULT_RESEARCH_POLICY_VALUES.maxProjectedPersonaCriteria,
      maxTargetedSearchCriteriaPerIcp:
        DEFAULT_RESEARCH_POLICY_VALUES.maxTargetedSearchCriteriaPerIcp,
    },
  });
}

/**
 * Authoritative effective usage policy resolver.
 * All enforcement must use this — do not duplicate inheritance logic.
 */
export async function getEffectiveUsagePolicy(input: {
  organizationId: string;
  userId: string;
}): Promise<EffectiveUsagePolicy> {
  await ensureOrganizationPolicies(input.organizationId);

  const [orgPolicy, override] = await Promise.all([
    prisma.organizationUsagePolicy.findUniqueOrThrow({
      where: { organizationId: input.organizationId },
    }),
    prisma.userUsageOverride.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: input.userId,
        },
      },
    }),
  ]);

  const activeResearchedCompanyLimit =
    override?.activeResearchedCompanyLimit ??
    orgPolicy.activeResearchedCompanyLimit;
  const dailyEmailGenerationLimit =
    override?.dailyEmailGenerationLimit ??
    orgPolicy.dailyEmailGenerationLimit;
  const dailyEmailSendWarningLimit =
    override?.dailyEmailSendWarningLimit ??
    orgPolicy.dailyEmailSendWarningLimit;
  const dailyEmailSendLimit =
    override?.dailyEmailSendLimit ?? orgPolicy.dailyEmailSendLimit;

  return {
    activeResearchedCompanyLimit,
    dailyEmailGenerationLimit,
    dailyEmailSendWarningLimit,
    dailyEmailSendLimit,
    emailDeeplinkMaxUrlLength: orgPolicy.emailDeeplinkMaxUrlLength,
    sources: {
      activeResearchedCompanyLimit:
        override?.activeResearchedCompanyLimit != null
          ? "USER_OVERRIDE"
          : "ORGANIZATION",
      dailyEmailGenerationLimit:
        override?.dailyEmailGenerationLimit != null
          ? "USER_OVERRIDE"
          : "ORGANIZATION",
      dailyEmailSendWarningLimit:
        override?.dailyEmailSendWarningLimit != null
          ? "USER_OVERRIDE"
          : "ORGANIZATION",
      dailyEmailSendLimit:
        override?.dailyEmailSendLimit != null
          ? "USER_OVERRIDE"
          : "ORGANIZATION",
      emailDeeplinkMaxUrlLength: "ORGANIZATION",
    },
  };
}

export async function getResearchPolicy(
  organizationId: string,
): Promise<ResearchPolicyResolved> {
  await ensureOrganizationPolicies(organizationId);
  const policy = await prisma.researchPolicy.findUniqueOrThrow({
    where: { organizationId },
  });
  return {
    maxSearchQueriesPerCompany: policy.maxSearchQueriesPerCompany,
    maxSourcesPerCompany: policy.maxSourcesPerCompany,
    researchFreshnessDays: policy.researchFreshnessDays,
    maxSearchQueriesPerContact: policy.maxSearchQueriesPerContact,
    maxSourcesPerContact: policy.maxSourcesPerContact,
    contactResearchFreshnessDays: policy.contactResearchFreshnessDays,
    productSourceResearchFreshnessDays:
      policy.productSourceResearchFreshnessDays,
    maxSearchQueriesPerProduct: policy.maxSearchQueriesPerProduct,
    maxSourcesPerProduct: policy.maxSourcesPerProduct,
    maxSearchQueriesPerPersona: policy.maxSearchQueriesPerPersona,
    maxSourcesPerPersona: policy.maxSourcesPerPersona,
    personaResearchFreshnessDays: policy.personaResearchFreshnessDays,
    maxProjectedPersonaCriteria: policy.maxProjectedPersonaCriteria,
    maxTargetedSearchCriteriaPerIcp: policy.maxTargetedSearchCriteriaPerIcp,
  };
}
