/**
 * Platform product catalog (billing.catalog) — marketing copy + entitlement floors
 * for NEW Checkout / Stripe sync. Existing org policies are not rewritten by edits.
 *
 * Standard recurring + credit Price IDs resolve from billing.prices (not duplicated).
 * Premium / Enterprise may store their own stripePriceId when sellable.
 */
import {
  BILLING_PLAN_COMPED,
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_PREMIUM,
  BILLING_PLAN_STANDARD,
  COMPANY_CREDIT_BLOCK,
  getPlanDefinition,
  type PlanEntitlements,
} from "@/lib/billing/plans";
import { DEFAULT_USAGE_POLICY_VALUES } from "@/lib/usage/defaults";

export const PLATFORM_SETTING_BILLING_CATALOG = "billing.catalog";

export type CatalogEntitlementFloors = {
  companyResearchLimit: number;
  dailyEmailLimit: number;
  monthlyEmailLimit: number | null;
  dailyAiGenerationLimit: number;
  researchFreshnessDays: number;
};

export type CatalogCompanyCredits = {
  blockSize: number;
  /** Display-only note (e.g. "for $30 each"). Empty → subscribe page loads Stripe amount. */
  displayPriceNote: string;
  /**
   * null → resolve from billing.prices.companyCreditsPriceId (Standard).
   * Set for plans that use a different credit Price.
   */
  stripePriceId: string | null;
  expiryMonths: number;
};

export type CatalogPlanEntry = {
  planCode: string;
  displayName: string;
  tagline: string;
  featureBullets: string[];
  trialNote: string;
  sellable: boolean;
  active: boolean;
  /**
   * null for STANDARD → resolve from billing.prices.standardMonthlyPriceId.
   * Premium / Enterprise store their own when sellable.
   */
  stripePriceId: string | null;
  entitlementFloors: {
    trial: CatalogEntitlementFloors | null;
    paid: CatalogEntitlementFloors;
  };
  companyCredits: CatalogCompanyCredits | null;
};

export type BillingCatalogSettingValue = {
  plans: CatalogPlanEntry[];
};

export type ResolvedCatalogEntitlements = PlanEntitlements & {
  dailyAiGenerationLimit: number;
};

function asNonNegInt(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

function asPositiveInt(raw: unknown): number | null {
  const n = asNonNegInt(raw);
  return n != null && n >= 1 ? n : null;
}

function asString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function asStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const t = item.trim();
    if (t) out.push(t);
  }
  return out;
}

function parseFloors(raw: unknown): CatalogEntitlementFloors | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const companyResearchLimit = asNonNegInt(o.companyResearchLimit);
  const dailyEmailLimit = asNonNegInt(o.dailyEmailLimit);
  const dailyAiGenerationLimit = asNonNegInt(o.dailyAiGenerationLimit);
  const researchFreshnessDays = asPositiveInt(o.researchFreshnessDays);
  if (
    companyResearchLimit == null ||
    dailyEmailLimit == null ||
    dailyAiGenerationLimit == null ||
    researchFreshnessDays == null
  ) {
    return null;
  }
  let monthlyEmailLimit: number | null;
  if (o.monthlyEmailLimit == null || o.monthlyEmailLimit === "") {
    monthlyEmailLimit = null;
  } else {
    monthlyEmailLimit = asNonNegInt(o.monthlyEmailLimit);
    if (monthlyEmailLimit == null) return null;
  }
  return {
    companyResearchLimit,
    dailyEmailLimit,
    monthlyEmailLimit,
    dailyAiGenerationLimit,
    researchFreshnessDays,
  };
}

function parseCompanyCredits(raw: unknown): CatalogCompanyCredits | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const blockSize = asPositiveInt(o.blockSize);
  const expiryMonths = asPositiveInt(o.expiryMonths);
  if (blockSize == null || expiryMonths == null) return null;
  const displayPriceNote =
    typeof o.displayPriceNote === "string" ? o.displayPriceNote.trim() : "";
  const stripeRaw = o.stripePriceId;
  const stripePriceId =
    stripeRaw == null || stripeRaw === ""
      ? null
      : asString(stripeRaw);
  if (stripeRaw != null && stripeRaw !== "" && !stripePriceId) return null;
  return {
    blockSize,
    displayPriceNote,
    stripePriceId,
    expiryMonths,
  };
}

function parsePlanEntry(raw: unknown): CatalogPlanEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const planCode = asString(o.planCode);
  const displayName = asString(o.displayName);
  if (!planCode || !displayName) return null;
  const tagline = typeof o.tagline === "string" ? o.tagline.trim() : "";
  const trialNote = typeof o.trialNote === "string" ? o.trialNote.trim() : "";
  const featureBullets = asStringArray(o.featureBullets) ?? [];
  const sellable = o.sellable === true;
  const active = o.active !== false;
  const stripeRaw = o.stripePriceId;
  const stripePriceId =
    stripeRaw == null || stripeRaw === ""
      ? null
      : asString(stripeRaw);
  if (stripeRaw != null && stripeRaw !== "" && !stripePriceId) return null;

  const floorsRaw = o.entitlementFloors;
  if (!floorsRaw || typeof floorsRaw !== "object" || Array.isArray(floorsRaw)) {
    return null;
  }
  const floorsObj = floorsRaw as Record<string, unknown>;
  const paid = parseFloors(floorsObj.paid);
  if (!paid) return null;
  let trial: CatalogEntitlementFloors | null = null;
  if (floorsObj.trial != null) {
    trial = parseFloors(floorsObj.trial);
    if (!trial) return null;
  }

  const companyCredits = parseCompanyCredits(o.companyCredits);

  return {
    planCode,
    displayName,
    tagline,
    featureBullets,
    trialNote,
    sellable,
    active,
    stripePriceId,
    entitlementFloors: { trial, paid },
    companyCredits,
  };
}

/** Returns null when the payload is missing or invalid (caller falls back to code). */
export function parseBillingCatalogSetting(
  raw: unknown,
): BillingCatalogSettingValue | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const plansRaw = (raw as Record<string, unknown>).plans;
  if (!Array.isArray(plansRaw) || plansRaw.length === 0) return null;
  const plans: CatalogPlanEntry[] = [];
  for (const item of plansRaw) {
    const plan = parsePlanEntry(item);
    if (!plan) return null;
    plans.push(plan);
  }
  return { plans };
}

export function buildBillingCatalogSetting(
  value: BillingCatalogSettingValue,
): BillingCatalogSettingValue {
  const parsed = parseBillingCatalogSetting(value);
  if (!parsed) {
    throw new Error("Invalid billing catalog payload.");
  }
  return parsed;
}

function floorsFromPlanEntitlements(
  e: PlanEntitlements,
  dailyAiGenerationLimit: number,
): CatalogEntitlementFloors {
  return {
    companyResearchLimit: e.activeResearchedCompanyLimit,
    dailyEmailLimit: e.dailyEmailSendWarningLimit,
    monthlyEmailLimit: e.monthlyEmailSendLimit,
    dailyAiGenerationLimit,
    researchFreshnessDays: e.researchFreshnessDays,
  };
}

/**
 * Code-default catalog seeded from plans.ts + current subscribe copy.
 * Used when PlatformSetting is missing or invalid.
 */
export function defaultBillingCatalogSetting(): BillingCatalogSettingValue {
  const standard = getPlanDefinition(BILLING_PLAN_STANDARD)!;
  const comped = getPlanDefinition(BILLING_PLAN_COMPED)!;
  const premium = getPlanDefinition(BILLING_PLAN_PREMIUM)!;
  const enterprise = getPlanDefinition(BILLING_PLAN_ENTERPRISE)!;
  const aiGen = DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit;

  return {
    plans: [
      {
        planCode: BILLING_PLAN_STANDARD,
        displayName: "Standard",
        tagline: "For individual salespeople",
        featureBullets: [
          "Research up to 100 companies on Standard",
          "Up to 50 curated emails per day (1,000 per month)",
          "Outlook Desktop, Microsoft 365, and Google Workspace sending",
          "Emails sent through your existing mailbox — replies come to you",
          "Add Company Research Credits in blocks of 100",
        ],
        trialNote:
          "Research up to 25 companies during your trial (100 on a paid plan). The 50/day sending limit protects your domain's email reputation and deliverability.",
        sellable: true,
        active: true,
        stripePriceId: null,
        entitlementFloors: {
          trial: floorsFromPlanEntitlements(
            standard.trialEntitlements!,
            aiGen,
          ),
          paid: floorsFromPlanEntitlements(standard.entitlements, aiGen),
        },
        companyCredits: {
          blockSize: COMPANY_CREDIT_BLOCK.units,
          displayPriceNote: "",
          stripePriceId: null,
          expiryMonths: COMPANY_CREDIT_BLOCK.expiryMonths,
        },
      },
      {
        planCode: BILLING_PLAN_COMPED,
        displayName: "Comped",
        tagline: "Platform-granted access",
        featureBullets: [],
        trialNote: "",
        sellable: false,
        active: true,
        stripePriceId: null,
        entitlementFloors: {
          trial: null,
          paid: floorsFromPlanEntitlements(comped.entitlements, aiGen),
        },
        companyCredits: null,
      },
      {
        planCode: BILLING_PLAN_PREMIUM,
        displayName: "Premium",
        tagline: "Coming later",
        featureBullets: [],
        trialNote: "",
        sellable: false,
        active: false,
        stripePriceId: null,
        entitlementFloors: {
          trial: floorsFromPlanEntitlements(
            premium.trialEntitlements!,
            aiGen,
          ),
          paid: floorsFromPlanEntitlements(premium.entitlements, aiGen),
        },
        companyCredits: {
          blockSize: COMPANY_CREDIT_BLOCK.units,
          displayPriceNote: "",
          stripePriceId: null,
          expiryMonths: COMPANY_CREDIT_BLOCK.expiryMonths,
        },
      },
      {
        planCode: BILLING_PLAN_ENTERPRISE,
        displayName: "Enterprise",
        tagline: "Coming later",
        featureBullets: [],
        trialNote: "",
        sellable: false,
        active: false,
        stripePriceId: null,
        entitlementFloors: {
          trial: null,
          paid: floorsFromPlanEntitlements(enterprise.entitlements, aiGen),
        },
        companyCredits: null,
      },
    ],
  };
}

export function findCatalogPlan(
  catalog: BillingCatalogSettingValue,
  planCode: string,
): CatalogPlanEntry | null {
  const code = planCode === "FREE" ? BILLING_PLAN_COMPED : planCode;
  return catalog.plans.find((p) => p.planCode === code) ?? null;
}

export function catalogFloorsForStatus(input: {
  plan: CatalogPlanEntry;
  billingStatus: string;
}): CatalogEntitlementFloors {
  if (
    input.billingStatus === "TRIALING" &&
    input.plan.entitlementFloors.trial
  ) {
    return input.plan.entitlementFloors.trial;
  }
  return input.plan.entitlementFloors.paid;
}

export function catalogFloorsToResolved(
  floors: CatalogEntitlementFloors,
): ResolvedCatalogEntitlements {
  return {
    activeResearchedCompanyLimit: floors.companyResearchLimit,
    dailyEmailSendWarningLimit: floors.dailyEmailLimit,
    monthlyEmailSendLimit: floors.monthlyEmailLimit,
    researchFreshnessDays: floors.researchFreshnessDays,
    dailyAiGenerationLimit: floors.dailyAiGenerationLimit,
  };
}

/**
 * Resolve entitlements for Stripe sync: catalog floors when present, else plans.ts.
 */
export function resolveCatalogEntitlementsForStatus(input: {
  catalog: BillingCatalogSettingValue | null;
  planCode: string;
  billingStatus: string;
}): ResolvedCatalogEntitlements | null {
  const fromCatalog =
    input.catalog != null
      ? findCatalogPlan(input.catalog, input.planCode)
      : null;
  if (fromCatalog?.active !== false && fromCatalog) {
    const floors = catalogFloorsForStatus({
      plan: fromCatalog,
      billingStatus: input.billingStatus,
    });
    return catalogFloorsToResolved(floors);
  }

  const plan = getPlanDefinition(input.planCode);
  if (!plan) return null;
  const base =
    input.billingStatus === "TRIALING" && plan.trialEntitlements
      ? plan.trialEntitlements
      : plan.entitlements;
  return {
    ...base,
    dailyAiGenerationLimit:
      DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
  };
}
