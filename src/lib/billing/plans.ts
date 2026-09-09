/**
 * Billing plan configuration — component kinds mapped to Stripe Price/Product IDs via env.
 * Dollar amounts live in Stripe; this module never hard-codes list prices.
 *
 * Paths:
 * - Self-serve → STANDARD (UNPAID → Checkout → TRIALING → ACTIVE)
 * - Platform COMPED → durable, no Stripe
 * - Platform billed → STANDARD UNPAID until Checkout
 */

export const BILLING_PLAN_COMPED = "COMPED" as const;
export const BILLING_PLAN_STANDARD = "STANDARD" as const;
export const BILLING_PLAN_PREMIUM = "PREMIUM" as const;
export const BILLING_PLAN_ENTERPRISE = "ENTERPRISE" as const;

/** @deprecated Use BILLING_PLAN_COMPED — kept for reading legacy rows during migration. */
export const BILLING_PLAN_FREE = BILLING_PLAN_COMPED;

export type KnownBillingPlanCode =
  | typeof BILLING_PLAN_COMPED
  | typeof BILLING_PLAN_STANDARD
  | typeof BILLING_PLAN_PREMIUM
  | typeof BILLING_PLAN_ENTERPRISE;

export type PlanComponent =
  | {
      kind: "recurring_base";
      stripePriceIdEnv: string;
      stripeProductIdEnv: string;
    }
  | {
      kind: "company_credit_block";
      stripePriceIdEnv: string;
      units: number;
      expiryMonths: number;
    };

export type PlanEntitlements = {
  activeResearchedCompanyLimit: number;
  dailyEmailSendWarningLimit: number;
  monthlyEmailSendLimit: number | null;
  researchFreshnessDays: number;
};

export type PlanDefinition = {
  planCode: KnownBillingPlanCode | string;
  sellable: boolean;
  requiresStripe: boolean;
  trialDays: number | null;
  /** Applied while billingStatus === TRIALING (company volume only differs today). */
  trialEntitlements: PlanEntitlements | null;
  components: PlanComponent[];
  entitlements: PlanEntitlements;
};

function envId(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export const BILLING_PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    planCode: BILLING_PLAN_COMPED,
    sellable: false,
    requiresStripe: false,
    trialDays: null,
    trialEntitlements: null,
    components: [],
    entitlements: {
      // Defaults only — platform sets real limits at create/edit time.
      activeResearchedCompanyLimit: 50,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: null,
      researchFreshnessDays: 90,
    },
  },
  {
    planCode: BILLING_PLAN_STANDARD,
    sellable: true,
    requiresStripe: true,
    trialDays: 7,
    trialEntitlements: {
      activeResearchedCompanyLimit: 25,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_STANDARD_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_STANDARD",
      },
    ],
    entitlements: {
      activeResearchedCompanyLimit: 100,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
  },
  {
    planCode: BILLING_PLAN_PREMIUM,
    sellable: false,
    requiresStripe: true,
    trialDays: 7,
    trialEntitlements: {
      activeResearchedCompanyLimit: 25,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_PREMIUM_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_PREMIUM",
      },
    ],
    entitlements: {
      activeResearchedCompanyLimit: 100,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
  },
  {
    planCode: BILLING_PLAN_ENTERPRISE,
    sellable: false,
    requiresStripe: true,
    trialDays: null,
    trialEntitlements: null,
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_ENTERPRISE",
      },
    ],
    entitlements: {
      activeResearchedCompanyLimit: 100,
      dailyEmailSendWarningLimit: 50,
      monthlyEmailSendLimit: 1000,
      researchFreshnessDays: 90,
    },
  },
] as const;

export const COMPANY_CREDIT_BLOCK: Extract<
  PlanComponent,
  { kind: "company_credit_block" }
> = {
  kind: "company_credit_block",
  stripePriceIdEnv: "STRIPE_PRICE_COMPANY_CREDITS_100",
  units: 100,
  expiryMonths: 12,
};

export function getPlanDefinition(planCode: string): PlanDefinition | null {
  if (planCode === "FREE") {
    return (
      BILLING_PLAN_CATALOG.find((p) => p.planCode === BILLING_PLAN_COMPED) ??
      null
    );
  }
  return (
    BILLING_PLAN_CATALOG.find((plan) => plan.planCode === planCode) ?? null
  );
}

/** Entitlements for the current Stripe lifecycle (trial overlay vs paid floor). */
export function resolveEntitlementsForStatus(input: {
  planCode: string;
  billingStatus: string;
}): PlanEntitlements | null {
  const plan = getPlanDefinition(input.planCode);
  if (!plan) return null;
  if (
    input.billingStatus === "TRIALING" &&
    plan.trialEntitlements
  ) {
    return plan.trialEntitlements;
  }
  return plan.entitlements;
}

export function resolveStripePriceId(envName: string): string | null {
  return envId(envName);
}

export function resolveStripeProductId(envName: string): string | null {
  return envId(envName);
}

export function planIsCheckoutReady(planCode: string): boolean {
  const plan = getPlanDefinition(planCode);
  if (!plan?.sellable || !plan.requiresStripe) return false;
  const base = plan.components.find((c) => c.kind === "recurring_base");
  if (!base || base.kind !== "recurring_base") return false;
  return Boolean(
    resolveStripePriceId(base.stripePriceIdEnv) &&
      resolveStripeProductId(base.stripeProductIdEnv),
  );
}

export function companyCreditBlockIsCheckoutReady(): boolean {
  return Boolean(resolveStripePriceId(COMPANY_CREDIT_BLOCK.stripePriceIdEnv));
}

export function creditExpiryDate(
  grantedAt: Date,
  expiryMonths: number = COMPANY_CREDIT_BLOCK.expiryMonths,
): Date {
  const expires = new Date(grantedAt);
  expires.setUTCMonth(expires.getUTCMonth() + expiryMonths);
  return expires;
}
