/**
 * Stripe Price/Product IDs for NEW Checkout — platform console first, then env.
 *
 * Key: billing.prices
 *   {
 *     "standardMonthlyPriceId": "price_…",
 *     "standardProductId": "prod_…",
 *     "companyCreditsPriceId": "price_…",
 *     "teamMonthlyPriceId": "price_…" | "",
 *     "teamProductId": "prod_…" | "",
 *     "enterpriseMonthlyPriceId": "price_…" | "",
 *     "enterpriseProductId": "prod_…" | ""
 *   }
 *
 * Changing these does not rewrite existing Stripe subscriptions; those keep the
 * Price stored on the subscription (mirrored to OrganizationBillingProfile).
 *
 * Copy and entitlement floors live in billing.catalog only.
 */

export const PLATFORM_SETTING_BILLING_PRICES = "billing.prices";

export const ENV_STRIPE_PRICE_STANDARD_MONTHLY = "STRIPE_PRICE_STANDARD_MONTHLY";
export const ENV_STRIPE_PRODUCT_STANDARD = "STRIPE_PRODUCT_STANDARD";
export const ENV_STRIPE_PRICE_COMPANY_CREDITS_100 =
  "STRIPE_PRICE_COMPANY_CREDITS_100";
export const ENV_STRIPE_PRICE_TEAM_MONTHLY = "STRIPE_PRICE_TEAM_MONTHLY";
export const ENV_STRIPE_PRODUCT_TEAM = "STRIPE_PRODUCT_TEAM";
export const ENV_STRIPE_PRICE_ENTERPRISE_MONTHLY =
  "STRIPE_PRICE_ENTERPRISE_MONTHLY";
export const ENV_STRIPE_PRODUCT_ENTERPRISE = "STRIPE_PRODUCT_ENTERPRISE";

export type BillingPricesSettingValue = {
  standardMonthlyPriceId: string;
  standardProductId: string;
  companyCreditsPriceId: string;
  /** Empty string = not configured yet (placeholder). */
  teamMonthlyPriceId: string;
  teamProductId: string;
  enterpriseMonthlyPriceId: string;
  enterpriseProductId: string;
};

export type BillingPriceField =
  | "standardMonthlyPriceId"
  | "standardProductId"
  | "companyCreditsPriceId"
  | "teamMonthlyPriceId"
  | "teamProductId"
  | "enterpriseMonthlyPriceId"
  | "enterpriseProductId";

export type BillingPriceSource = "platform" | "environment";

export type EffectiveBillingPriceField = {
  value: string | null;
  source: BillingPriceSource;
  sourceLabel: string;
};

export type EffectiveBillingPrices = {
  standardMonthlyPriceId: EffectiveBillingPriceField;
  standardProductId: EffectiveBillingPriceField;
  companyCreditsPriceId: EffectiveBillingPriceField;
  teamMonthlyPriceId: EffectiveBillingPriceField;
  teamProductId: EffectiveBillingPriceField;
  enterpriseMonthlyPriceId: EffectiveBillingPriceField;
  enterpriseProductId: EffectiveBillingPriceField;
};

function trimId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeStripePriceId(id: string): boolean {
  return /^price_[A-Za-z0-9]+$/.test(id);
}

function looksLikeStripeProductId(id: string): boolean {
  return /^prod_[A-Za-z0-9]+$/.test(id);
}

function optionalPriceId(raw: unknown): string | null {
  const id = trimId(raw);
  if (id == null) return null;
  return looksLikeStripePriceId(id) ? id : null;
}

function optionalProductId(raw: unknown): string | null {
  const id = trimId(raw);
  if (id == null) return null;
  return looksLikeStripeProductId(id) ? id : null;
}

/**
 * Parse/validate console JSON. Returns null if missing or malformed
 * (caller falls back to environment).
 * Team/Enterprise IDs are optional placeholders (empty allowed).
 */
export function parseBillingPricesSetting(
  raw: unknown,
): BillingPricesSettingValue | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const standardMonthlyPriceId = trimId(obj.standardMonthlyPriceId);
  const standardProductId = trimId(obj.standardProductId);
  const companyCreditsPriceId = trimId(obj.companyCreditsPriceId);
  if (
    !standardMonthlyPriceId ||
    !standardProductId ||
    !companyCreditsPriceId
  ) {
    return null;
  }
  if (
    !looksLikeStripePriceId(standardMonthlyPriceId) ||
    !looksLikeStripePriceId(companyCreditsPriceId) ||
    !looksLikeStripeProductId(standardProductId)
  ) {
    return null;
  }

  // Optional: empty string OK; invalid non-empty fails the whole parse.
  const teamMonthlyRaw = obj.teamMonthlyPriceId;
  const teamProductRaw = obj.teamProductId;
  const enterpriseMonthlyRaw = obj.enterpriseMonthlyPriceId;
  const enterpriseProductRaw = obj.enterpriseProductId;

  if (
    trimId(teamMonthlyRaw) != null &&
    optionalPriceId(teamMonthlyRaw) == null
  ) {
    return null;
  }
  if (
    trimId(teamProductRaw) != null &&
    optionalProductId(teamProductRaw) == null
  ) {
    return null;
  }
  if (
    trimId(enterpriseMonthlyRaw) != null &&
    optionalPriceId(enterpriseMonthlyRaw) == null
  ) {
    return null;
  }
  if (
    trimId(enterpriseProductRaw) != null &&
    optionalProductId(enterpriseProductRaw) == null
  ) {
    return null;
  }

  return {
    standardMonthlyPriceId,
    standardProductId,
    companyCreditsPriceId,
    teamMonthlyPriceId: optionalPriceId(teamMonthlyRaw) ?? "",
    teamProductId: optionalProductId(teamProductRaw) ?? "",
    enterpriseMonthlyPriceId: optionalPriceId(enterpriseMonthlyRaw) ?? "",
    enterpriseProductId: optionalProductId(enterpriseProductRaw) ?? "",
  };
}

/** Build a validated payload for upsert from the console form. */
export function buildBillingPricesSetting(input: {
  standardMonthlyPriceId: string;
  standardProductId: string;
  companyCreditsPriceId: string;
  teamMonthlyPriceId?: string;
  teamProductId?: string;
  enterpriseMonthlyPriceId?: string;
  enterpriseProductId?: string;
}): BillingPricesSettingValue {
  const parsed = parseBillingPricesSetting({
    standardMonthlyPriceId: input.standardMonthlyPriceId.trim(),
    standardProductId: input.standardProductId.trim(),
    companyCreditsPriceId: input.companyCreditsPriceId.trim(),
    teamMonthlyPriceId: (input.teamMonthlyPriceId ?? "").trim(),
    teamProductId: (input.teamProductId ?? "").trim(),
    enterpriseMonthlyPriceId: (input.enterpriseMonthlyPriceId ?? "").trim(),
    enterpriseProductId: (input.enterpriseProductId ?? "").trim(),
  });
  if (!parsed) {
    throw new Error(
      "Price and product IDs must look like Stripe IDs (price_… / prod_…), or be left blank for Team/Enterprise placeholders.",
    );
  }
  return parsed;
}

function envRaw(name: string): string | null {
  return trimId(process.env[name]);
}

function environmentSourceLabel(envName: string): string {
  const raw = envRaw(envName);
  if (raw == null) return `${envName} (unset)`;
  return envName;
}

export function resolveEnvBillingPrices(): {
  standardMonthlyPriceId: string | null;
  standardProductId: string | null;
  companyCreditsPriceId: string | null;
  teamMonthlyPriceId: string | null;
  teamProductId: string | null;
  enterpriseMonthlyPriceId: string | null;
  enterpriseProductId: string | null;
} {
  return {
    standardMonthlyPriceId: envRaw(ENV_STRIPE_PRICE_STANDARD_MONTHLY),
    standardProductId: envRaw(ENV_STRIPE_PRODUCT_STANDARD),
    companyCreditsPriceId: envRaw(ENV_STRIPE_PRICE_COMPANY_CREDITS_100),
    teamMonthlyPriceId: envRaw(ENV_STRIPE_PRICE_TEAM_MONTHLY),
    teamProductId: envRaw(ENV_STRIPE_PRODUCT_TEAM),
    enterpriseMonthlyPriceId: envRaw(ENV_STRIPE_PRICE_ENTERPRISE_MONTHLY),
    enterpriseProductId: envRaw(ENV_STRIPE_PRODUCT_ENTERPRISE),
  };
}

/**
 * Effective Stripe IDs: platform console first (when a valid row exists),
 * then environment per field. Optional Team/Enterprise fields merge
 * platform non-empty with env fallback even when console row exists.
 */
export function resolveEffectiveBillingPrices(input?: {
  platformSetting?: BillingPricesSettingValue | null;
}): EffectiveBillingPrices {
  const env = resolveEnvBillingPrices();
  const platform = input?.platformSetting ?? null;

  function requiredField(
    key: "standardMonthlyPriceId" | "standardProductId" | "companyCreditsPriceId",
    envName: string,
    envValue: string | null,
  ): EffectiveBillingPriceField {
    if (platform) {
      return {
        value: platform[key],
        source: "platform",
        sourceLabel: "platform console",
      };
    }
    return {
      value: envValue,
      source: "environment",
      sourceLabel: environmentSourceLabel(envName),
    };
  }

  function optionalField(
    key:
      | "teamMonthlyPriceId"
      | "teamProductId"
      | "enterpriseMonthlyPriceId"
      | "enterpriseProductId",
    envName: string,
    envValue: string | null,
  ): EffectiveBillingPriceField {
    const fromPlatform = platform?.[key]?.trim() || null;
    if (fromPlatform) {
      return {
        value: fromPlatform,
        source: "platform",
        sourceLabel: "platform console",
      };
    }
    return {
      value: envValue,
      source: "environment",
      sourceLabel: environmentSourceLabel(envName),
    };
  }

  return {
    standardMonthlyPriceId: requiredField(
      "standardMonthlyPriceId",
      ENV_STRIPE_PRICE_STANDARD_MONTHLY,
      env.standardMonthlyPriceId,
    ),
    standardProductId: requiredField(
      "standardProductId",
      ENV_STRIPE_PRODUCT_STANDARD,
      env.standardProductId,
    ),
    companyCreditsPriceId: requiredField(
      "companyCreditsPriceId",
      ENV_STRIPE_PRICE_COMPANY_CREDITS_100,
      env.companyCreditsPriceId,
    ),
    teamMonthlyPriceId: optionalField(
      "teamMonthlyPriceId",
      ENV_STRIPE_PRICE_TEAM_MONTHLY,
      env.teamMonthlyPriceId,
    ),
    teamProductId: optionalField(
      "teamProductId",
      ENV_STRIPE_PRODUCT_TEAM,
      env.teamProductId,
    ),
    enterpriseMonthlyPriceId: optionalField(
      "enterpriseMonthlyPriceId",
      ENV_STRIPE_PRICE_ENTERPRISE_MONTHLY,
      env.enterpriseMonthlyPriceId,
    ),
    enterpriseProductId: optionalField(
      "enterpriseProductId",
      ENV_STRIPE_PRODUCT_ENTERPRISE,
      env.enterpriseProductId,
    ),
  };
}

export function effectivePricesAreCheckoutReady(
  prices: EffectiveBillingPrices,
  planCode: string = "STANDARD",
): boolean {
  if (planCode === "TEAM" || planCode === "PREMIUM") {
    return Boolean(prices.teamMonthlyPriceId.value && prices.teamProductId.value);
  }
  if (planCode === "ENTERPRISE") {
    return Boolean(
      prices.enterpriseMonthlyPriceId.value &&
        prices.enterpriseProductId.value,
    );
  }
  return Boolean(
    prices.standardMonthlyPriceId.value && prices.standardProductId.value,
  );
}

export function effectiveCreditsAreCheckoutReady(
  prices: EffectiveBillingPrices,
): boolean {
  return Boolean(prices.companyCreditsPriceId.value);
}

/** Flattened IDs for Checkout / catalog callers. */
export function flattenEffectiveBillingPrices(
  prices: EffectiveBillingPrices,
): {
  standardMonthlyPriceId: string | null;
  standardProductId: string | null;
  companyCreditsPriceId: string | null;
  teamMonthlyPriceId: string | null;
  teamProductId: string | null;
  enterpriseMonthlyPriceId: string | null;
  enterpriseProductId: string | null;
} {
  return {
    standardMonthlyPriceId: prices.standardMonthlyPriceId.value,
    standardProductId: prices.standardProductId.value,
    companyCreditsPriceId: prices.companyCreditsPriceId.value,
    teamMonthlyPriceId: prices.teamMonthlyPriceId.value,
    teamProductId: prices.teamProductId.value,
    enterpriseMonthlyPriceId: prices.enterpriseMonthlyPriceId.value,
    enterpriseProductId: prices.enterpriseProductId.value,
  };
}

export function priceIdsForPlan(
  prices: EffectiveBillingPrices,
  planCode: string,
): { priceId: string | null; productId: string | null } {
  if (planCode === "TEAM" || planCode === "PREMIUM") {
    return {
      priceId: prices.teamMonthlyPriceId.value,
      productId: prices.teamProductId.value,
    };
  }
  if (planCode === "ENTERPRISE") {
    return {
      priceId: prices.enterpriseMonthlyPriceId.value,
      productId: prices.enterpriseProductId.value,
    };
  }
  return {
    priceId: prices.standardMonthlyPriceId.value,
    productId: prices.standardProductId.value,
  };
}
