-- Phase C / Phase 2: mirror list price + discount so platform console shows
-- what the customer pays without opening Stripe. No payment PII.

ALTER TABLE "OrganizationBillingProfile"
  ADD COLUMN "stripePriceUnitAmountCents" INTEGER,
  ADD COLUMN "stripePriceCurrency" TEXT,
  ADD COLUMN "stripePriceInterval" TEXT,
  ADD COLUMN "stripeDiscountPercentOff" DOUBLE PRECISION,
  ADD COLUMN "stripeDiscountAmountOffCents" INTEGER,
  ADD COLUMN "stripeCouponId" TEXT,
  ADD COLUMN "stripeEffectiveUnitAmountCents" INTEGER;
