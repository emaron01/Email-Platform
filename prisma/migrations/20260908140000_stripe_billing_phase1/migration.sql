-- Phase C / Phase 1: billing lock reason, Stripe identifiers, one-time company
-- research credits (12-month expiry), webhook idempotency ledger, monthly send cap.

CREATE TYPE "BillingLockReason" AS ENUM ('TRIAL_ENDED', 'PAYMENT_FAILED', 'CANCELED');

ALTER TABLE "OrganizationBillingProfile"
  ADD COLUMN "stripePriceId" TEXT,
  ADD COLUMN "stripeProductId" TEXT,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "gracePeriodEndsAt" TIMESTAMP(3),
  ADD COLUMN "lockReason" "BillingLockReason",
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canceledAt" TIMESTAMP(3);

CREATE INDEX "OrganizationBillingProfile_stripeSubscriptionId_idx"
  ON "OrganizationBillingProfile"("stripeSubscriptionId");

CREATE TABLE "CompanyResearchCredit" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyResearchCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyResearchCredit_stripeCheckoutSessionId_key"
  ON "CompanyResearchCredit"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "CompanyResearchCredit_stripePaymentIntentId_key"
  ON "CompanyResearchCredit"("stripePaymentIntentId");
CREATE INDEX "CompanyResearchCredit_organizationId_idx"
  ON "CompanyResearchCredit"("organizationId");
CREATE INDEX "CompanyResearchCredit_organizationId_expiresAt_idx"
  ON "CompanyResearchCredit"("organizationId", "expiresAt");

ALTER TABLE "CompanyResearchCredit"
  ADD CONSTRAINT "CompanyResearchCredit_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key"
  ON "StripeWebhookEvent"("stripeEventId");
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");
CREATE INDEX "StripeWebhookEvent_processedAt_idx"
  ON "StripeWebhookEvent"("processedAt");

ALTER TABLE "OrganizationUsagePolicy"
  ADD COLUMN "monthlyEmailSendLimit" INTEGER;
