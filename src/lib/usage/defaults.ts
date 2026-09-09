/**
 * Initial Organization policy defaults.
 *
 * Self-serve provision uses SELF_SERVE_USAGE_POLICY_VALUES (0 companies until trial).
 * Platform create passes explicit limits. Enforcement reads DB rows, not these constants.
 */
export const DEFAULT_USAGE_POLICY_VALUES = {
  /** Platform COMPED form default when operator does not override. */
  activeResearchedCompanyLimit: 50,
  dailyEmailGenerationLimit: 500,
  dailyEmailSendWarningLimit: 50,
  dailyEmailSendLimit: 250,
  monthlyEmailSendLimit: null as number | null,
  emailDeeplinkMaxUrlLength: 1800,
} as const;

/** Self-serve before/during Checkout — no research until Stripe trial grants 25. */
export const SELF_SERVE_USAGE_POLICY_VALUES = {
  activeResearchedCompanyLimit: 0,
  dailyEmailGenerationLimit: 500,
  dailyEmailSendWarningLimit: 50,
  dailyEmailSendLimit: 250,
  monthlyEmailSendLimit: 1000,
  emailDeeplinkMaxUrlLength: 1800,
} as const;

export const DEFAULT_RESEARCH_POLICY_VALUES = {
  contactResearchEnabled: false,
  maxSearchQueriesPerCompany: 3,
  maxSourcesPerCompany: 8,
  researchFreshnessDays: 90,
  maxSearchQueriesPerContact: 2,
  maxSourcesPerContact: 6,
  contactResearchFreshnessDays: 90,
  productSourceResearchFreshnessDays: 120,
  maxSourcesPerProduct: 12,
  maxSearchQueriesPerPersona: 2,
  maxSourcesPerPersona: 8,
  personaResearchFreshnessDays: 90,
  maxProjectedPersonaCriteria: 15,
  maxTargetedSearchCriteriaPerIcp: 3,
} as const;

export const DEFAULT_ORGANIZATION_TIMEZONE = "UTC";
