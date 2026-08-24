/**
 * Initial Organization policy defaults.
 *
 * These values are inserted into the database when an Organization is created.
 * Enforcement MUST read limits from OrganizationUsagePolicy / ResearchPolicy
 * (or effective resolver), never from these constants.
 */
export const DEFAULT_USAGE_POLICY_VALUES = {
  activeResearchedCompanyLimit: 100,
  dailyEmailGenerationLimit: 35,
  emailDeeplinkMaxUrlLength: 1800,
} as const;

export const DEFAULT_RESEARCH_POLICY_VALUES = {
  maxSearchQueriesPerCompany: 3,
  maxSourcesPerCompany: 8,
  researchFreshnessDays: 90,
  maxSearchQueriesPerContact: 2,
  maxSourcesPerContact: 6,
  contactResearchFreshnessDays: 90,
  productSourceResearchFreshnessDays: 120,
  maxSearchQueriesPerProduct: 3,
  maxSourcesPerProduct: 12,
  maxSearchQueriesPerPersona: 2,
  maxSourcesPerPersona: 8,
  personaResearchFreshnessDays: 90,
  maxProjectedPersonaCriteria: 15,
  maxTargetedSearchCriteriaPerIcp: 3,
} as const;

/** Default IANA timezone for new Organizations when none is provided. */
export const DEFAULT_ORGANIZATION_TIMEZONE = "UTC";
