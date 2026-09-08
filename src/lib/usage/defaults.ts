/**
 * Initial Organization policy defaults.
 *
 * These values are inserted into the database when an Organization is created.
 * Enforcement MUST read limits from OrganizationUsagePolicy / ResearchPolicy
 * (or effective resolver), never from these constants.
 */
export const DEFAULT_USAGE_POLICY_VALUES = {
  /** FREE / pre-Stripe default; STANDARD entitlement writer raises to 100 on checkout. */
  activeResearchedCompanyLimit: 50,
  /** Platform AI cost ceiling — far above normal sending volume; not a send cap. */
  dailyEmailGenerationLimit: 500,
  /**
   * Soft domain-reputation advisory for confirmed sends (never a hard block).
   * STANDARD marketing limit is 50/day — set here as the free/default advisory too.
   */
  dailyEmailSendWarningLimit: 50,
  /**
   * Legacy hard-block field retained in the DB for existing orgs. Enforcement no
   * longer blocks sends; advisory uses dailyEmailSendWarningLimit only.
   */
  dailyEmailSendLimit: 250,
  /** Null = no monthly hard block (FREE comps). STANDARD sets 1000 on activate. */
  monthlyEmailSendLimit: null as number | null,
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

/** Default IANA timezone for new Organizations when none is provided. */
export const DEFAULT_ORGANIZATION_TIMEZONE = "UTC";
