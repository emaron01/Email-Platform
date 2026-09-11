/**
 * Create the five forever % referral coupons in Stripe (test or live by key).
 *
 * Usage:
 *   dotenv -e .env.local -e .env -- tsx scripts/create-referral-coupons.ts
 *
 * Requires STRIPE_SECRET_KEY and Standard product ID (STRIPE_PRODUCT_STANDARD
 * or the product ID saved under billing.prices in /platform/billing).
 * Coupon ids are fixed (referral_reward_10 … _50) so test and live match.
 */
import Stripe from "stripe";
import {
  REFERRAL_REWARD_COUPON_IDS,
  REFERRAL_REWARD_PERCENTS,
} from "../src/lib/billing/referral-coupons";
import { parseBillingPricesSetting } from "../src/lib/billing/billing-prices";

async function resolveStandardProductId(): Promise<string> {
  const fromEnv = process.env.STRIPE_PRODUCT_STANDARD?.trim();
  if (process.env.DATABASE_URL?.trim()) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      try {
        const row = await prisma.platformSetting.findUnique({
          where: { key: "billing.prices" },
          select: { value: true },
        });
        const parsed = parseBillingPricesSetting(row?.value ?? null);
        if (parsed?.standardProductId) return parsed.standardProductId;
      } finally {
        await prisma.$disconnect();
      }
    } catch {
      // Fall through to env — script still works without DB.
    }
  }
  if (fromEnv) return fromEnv;
  throw new Error(
    "Standard product ID required: set billing.prices in /platform/billing or STRIPE_PRODUCT_STANDARD",
  );
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }
  const productId = await resolveStandardProductId();

  const mode = key.startsWith("sk_live")
    ? "live"
    : key.startsWith("sk_test")
      ? "test"
      : "unknown";
  const stripe = new Stripe(key);

  console.log(`Creating referral coupons in Stripe (${mode}) for product ${productId}`);

  for (const percent of REFERRAL_REWARD_PERCENTS) {
    const id = REFERRAL_REWARD_COUPON_IDS[percent];
    try {
      const existing = await stripe.coupons.retrieve(id);
      console.log(
        `EXISTS  ${id}  percent_off=${existing.percent_off} duration=${existing.duration}`,
      );
      continue;
    } catch {
      // create below
    }

    const created = await stripe.coupons.create({
      id,
      name: `Referral reward ${percent}%`,
      percent_off: percent,
      duration: "forever",
      applies_to: { products: [productId] },
      metadata: {
        purpose: "referral_reward",
        percent: String(percent),
      },
    });
    console.log(
      `CREATED ${created.id}  percent_off=${created.percent_off} duration=${created.duration}`,
    );
  }

  console.log("");
  console.log("Env to set (optional overrides; fixed ids work without env):");
  for (const percent of REFERRAL_REWARD_PERCENTS) {
    console.log(
      `STRIPE_COUPON_REFERRAL_${percent}=${REFERRAL_REWARD_COUPON_IDS[percent]}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
