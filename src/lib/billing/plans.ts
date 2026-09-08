/**
 * Billing plan configuration — component kinds mapped to Stripe Price/Product IDs via env.
 * Dollar amounts live in Stripe; this module never hard-codes list prices.
 */

export const BILLING_PLAN_FREE = "FREE" as const;
export const BILLING_PLAN_STANDARD = "STANDARD" as const;
export const BILLING_PLAN_PREMIUM = "PREMIUM" as const;
export const BILLING_PLAN_ENTERPRISE = "ENTERPRISE" as const;

export type KnownBillingPlanCode =
  | typeof BILLING_PLAN_FREE
  | typeof BILLING_PLAN_STANDARD
  | typeof BILLING_PLAN_PREMIUM
  | typeof BILLING_PLAN_ENTERPRISE;

export type PlanComponent =
  | {
      kind: "recurring_base";
      /** Env var name holding Stripe Price id (price_…). */
      stripePriceIdEnv: string;
      /** Env var name holding Stripe Product id (prod_…). */
      stripeProductIdEnv: string;
    }
  | {
      kind: "company_credit_block";
      /** One-time Price id env — never a recurring/annual subscription item. */
      stripePriceIdEnv: string;
      units: number;
      /** Months until purchased credits expire (from grant date). */
      expiryMonths: number;
    };

export type PlanEntitlements = {
  /** Base active researched company slots (credits add on top). */
  activeResearchedCompanyLimit: number;
  /** Soft daily send advisory threshold — never a hard block. */
  dailyEmailSendWarningLimit: number;
  /** Hard monthly send cap; null = no monthly hard block. */
  monthlyEmailSendLimit: number | null;
  researchFreshnessDays: number;
};

export type PlanDefinition = {
  planCode: KnownBillingPlanCode | string;
  /** False until Stripe Product/Price exist (PREMIUM/ENTERPRISE stubs). */
  sellable: boolean;
  /** False for FREE — platform console only, no Checkout. */
  requiresStripe: boolean;
  trialDays: number | null;
  components: PlanComponent[];
  entitlements: PlanEntitlements;
};

function envId(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

/**
 * Catalog. STANDARD is the only self-serve paid plan until PREMIUM/ENTERPRISE
 * Stripe objects exist. Credit packs are one-time payments, not subscription items.
 */
export const BILLING_PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    planCode: BILLING_PLAN_FREE,
    sellable: false,
    requiresStripe: false,
    trialDays: null,
    components: [],
    entitlements: {
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
    components: [
      {
        kind: "recurring_base",
        stripePriceIdEnv: "STRIPE_PRICE_PREMIUM_MONTHLY",
        stripeProductIdEnv: "STRIPE_PRODUCT_PREMIUM",
      },
    ],
    entitlements: {
      // Placeholder until product is defined — not sellable.
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

/** One-time company research credit pack — not attached to the subscription. */
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
  return (
    BILLING_PLAN_CATALOG.find((plan) => plan.planCode === planCode) ?? null
  );
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
