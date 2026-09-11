/**
 * Stripe Price/Product IDs for NEW Checkout — platform console first, then env.
 *
 * Key: billing.prices
 *   {
 *     "standardMonthlyPriceId": "price_…",
 *     "standardProductId": "prod_…",
 *     "companyCreditsPriceId": "price_…"
 *   }
 *
 * Changing these does not rewrite existing Stripe subscriptions; those keep the
 * Price stored on the subscription (mirrored to OrganizationBillingProfile).
 */

export const PLATFORM_SETTING_BILLING_PRICES = "billing.prices";

export const ENV_STRIPE_PRICE_STANDARD_MONTHLY = "STRIPE_PRICE_STANDARD_MONTHLY";
export const ENV_STRIPE_PRODUCT_STANDARD = "STRIPE_PRODUCT_STANDARD";
export const ENV_STRIPE_PRICE_COMPANY_CREDITS_100 =
  "STRIPE_PRICE_COMPANY_CREDITS_100";

export type BillingPricesSettingValue = {
  standardMonthlyPriceId: string;
  standardProductId: string;
  companyCreditsPriceId: string;
};

export type BillingPriceField =
  | "standardMonthlyPriceId"
  | "standardProductId"
  | "companyCreditsPriceId";

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

/**
 * Parse/validate console JSON. Returns null if missing or malformed
 * (caller falls back to environment).
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
  return {
    standardMonthlyPriceId,
    standardProductId,
    companyCreditsPriceId,
  };
}

/** Build a validated payload for upsert from the console form. */
export function buildBillingPricesSetting(input: {
  standardMonthlyPriceId: string;
  standardProductId: string;
  companyCreditsPriceId: string;
}): BillingPricesSettingValue {
  const parsed = parseBillingPricesSetting({
    standardMonthlyPriceId: input.standardMonthlyPriceId.trim(),
    standardProductId: input.standardProductId.trim(),
    companyCreditsPriceId: input.companyCreditsPriceId.trim(),
  });
  if (!parsed) {
    throw new Error(
      "Price and product IDs must look like Stripe IDs (price_… / prod_…).",
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
} {
  return {
    standardMonthlyPriceId: envRaw(ENV_STRIPE_PRICE_STANDARD_MONTHLY),
    standardProductId: envRaw(ENV_STRIPE_PRODUCT_STANDARD),
    companyCreditsPriceId: envRaw(ENV_STRIPE_PRICE_COMPANY_CREDITS_100),
  };
}

/**
 * Effective Stripe IDs: platform console first (when a valid row exists),
 * then environment per field.
 */
export function resolveEffectiveBillingPrices(input?: {
  platformSetting?: BillingPricesSettingValue | null;
}): EffectiveBillingPrices {
  const env = resolveEnvBillingPrices();
  const platform = input?.platformSetting ?? null;

  function field(
    key: BillingPriceField,
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

  return {
    standardMonthlyPriceId: field(
      "standardMonthlyPriceId",
      ENV_STRIPE_PRICE_STANDARD_MONTHLY,
      env.standardMonthlyPriceId,
    ),
    standardProductId: field(
      "standardProductId",
      ENV_STRIPE_PRODUCT_STANDARD,
      env.standardProductId,
    ),
    companyCreditsPriceId: field(
      "companyCreditsPriceId",
      ENV_STRIPE_PRICE_COMPANY_CREDITS_100,
      env.companyCreditsPriceId,
    ),
  };
}

export function effectivePricesAreCheckoutReady(
  prices: EffectiveBillingPrices,
): boolean {
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
} {
  return {
    standardMonthlyPriceId: prices.standardMonthlyPriceId.value,
    standardProductId: prices.standardProductId.value,
    companyCreditsPriceId: prices.companyCreditsPriceId.value,
  };
}
