/**
 * Validate billing.prices IDs against the live Stripe API before save.
 * A typo must fail here — not on the next customer's Checkout.
 */
import "server-only";

import type { BillingPricesSettingValue } from "@/lib/billing/billing-prices";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { TenantError } from "@/lib/tenant/errors";

function stripeNotFoundMessage(kind: "price" | "product", id: string): string {
  return `Stripe ${kind} "${id}" was not found. Check the ID in the Stripe Dashboard and try again.`;
}

function isStripeMissingResource(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; statusCode?: number };
  return err.code === "resource_missing" || err.statusCode === 404;
}

/**
 * Retrieves Standard monthly price, Standard product, and credit price.
 * Ensures the monthly price belongs to the given Standard product.
 */
export async function validateBillingPricesAgainstStripe(
  value: BillingPricesSettingValue,
): Promise<void> {
  if (!stripeConfigured()) {
    throw new TenantError(
      "Stripe is not configured (STRIPE_SECRET_KEY). Cannot validate price IDs.",
    );
  }

  const stripe = getStripe();

  let standardPrice;
  try {
    standardPrice = await stripe.prices.retrieve(value.standardMonthlyPriceId, {
      expand: ["product"],
    });
  } catch (error) {
    if (isStripeMissingResource(error)) {
      throw new TenantError(
        stripeNotFoundMessage("price", value.standardMonthlyPriceId),
      );
    }
    throw new TenantError(
      `Unable to verify Standard price "${value.standardMonthlyPriceId}" with Stripe. Try again.`,
    );
  }

  if (standardPrice.deleted) {
    throw new TenantError(
      `Stripe price "${value.standardMonthlyPriceId}" is deleted.`,
    );
  }

  const priceProductId =
    typeof standardPrice.product === "string"
      ? standardPrice.product
      : standardPrice.product &&
          typeof standardPrice.product === "object" &&
          !("deleted" in standardPrice.product && standardPrice.product.deleted)
        ? standardPrice.product.id
        : null;

  if (!priceProductId) {
    throw new TenantError(
      `Stripe price "${value.standardMonthlyPriceId}" has no product.`,
    );
  }
  if (priceProductId !== value.standardProductId) {
    throw new TenantError(
      `Standard monthly price belongs to product "${priceProductId}", not "${value.standardProductId}". Use matching Price and Product IDs.`,
    );
  }

  try {
    const product = await stripe.products.retrieve(value.standardProductId);
    if (product.deleted) {
      throw new TenantError(
        `Stripe product "${value.standardProductId}" is deleted.`,
      );
    }
  } catch (error) {
    if (error instanceof TenantError) throw error;
    if (isStripeMissingResource(error)) {
      throw new TenantError(
        stripeNotFoundMessage("product", value.standardProductId),
      );
    }
    throw new TenantError(
      `Unable to verify Standard product "${value.standardProductId}" with Stripe. Try again.`,
    );
  }

  try {
    const creditPrice = await stripe.prices.retrieve(
      value.companyCreditsPriceId,
    );
    if (creditPrice.deleted) {
      throw new TenantError(
        `Stripe price "${value.companyCreditsPriceId}" is deleted.`,
      );
    }
  } catch (error) {
    if (error instanceof TenantError) throw error;
    if (isStripeMissingResource(error)) {
      throw new TenantError(
        stripeNotFoundMessage("price", value.companyCreditsPriceId),
      );
    }
    throw new TenantError(
      `Unable to verify company credits price "${value.companyCreditsPriceId}" with Stripe. Try again.`,
    );
  }

  await validateOptionalPriceProductPair({
    label: "Team",
    priceId: value.teamMonthlyPriceId,
    productId: value.teamProductId,
  });
  await validateOptionalPriceProductPair({
    label: "Enterprise",
    priceId: value.enterpriseMonthlyPriceId,
    productId: value.enterpriseProductId,
  });
}

async function validateOptionalPriceProductPair(input: {
  label: string;
  priceId: string;
  productId: string;
}): Promise<void> {
  const priceId = input.priceId.trim();
  const productId = input.productId.trim();
  if (!priceId && !productId) return;
  if (!priceId || !productId) {
    throw new TenantError(
      `${input.label} requires both a Price ID and Product ID, or leave both blank.`,
    );
  }
  if (!stripeConfigured()) {
    throw new TenantError(
      "Stripe is not configured (STRIPE_SECRET_KEY). Cannot validate price IDs.",
    );
  }
  const stripe = getStripe();
  let price;
  try {
    price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
  } catch (error) {
    if (isStripeMissingResource(error)) {
      throw new TenantError(stripeNotFoundMessage("price", priceId));
    }
    throw new TenantError(
      `Unable to verify ${input.label} price "${priceId}" with Stripe. Try again.`,
    );
  }
  if (price.deleted) {
    throw new TenantError(`Stripe price "${priceId}" is deleted.`);
  }
  const priceProductId =
    typeof price.product === "string"
      ? price.product
      : price.product &&
          typeof price.product === "object" &&
          !("deleted" in price.product && price.product.deleted)
        ? price.product.id
        : null;
  if (!priceProductId) {
    throw new TenantError(`Stripe price "${priceId}" has no product.`);
  }
  if (priceProductId !== productId) {
    throw new TenantError(
      `${input.label} monthly price belongs to product "${priceProductId}", not "${productId}". Use matching Price and Product IDs.`,
    );
  }
  try {
    const product = await stripe.products.retrieve(productId);
    if (product.deleted) {
      throw new TenantError(`Stripe product "${productId}" is deleted.`);
    }
  } catch (error) {
    if (error instanceof TenantError) throw error;
    if (isStripeMissingResource(error)) {
      throw new TenantError(stripeNotFoundMessage("product", productId));
    }
    throw new TenantError(
      `Unable to verify ${input.label} product "${productId}" with Stripe. Try again.`,
    );
  }
}
