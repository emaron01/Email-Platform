-- Account type + billing state (free until Stripe). No payment collection yet.

CREATE TYPE "OrganizationAccountType" AS ENUM ('INDIVIDUAL', 'ENTERPRISE');
CREATE TYPE "BillingStatus" AS ENUM ('FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

ALTER TYPE "AdminAuditAction" ADD VALUE 'PLATFORM_ORGANIZATION_CREATED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'ORGANIZATION_MEMBER_REMOVED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'ORGANIZATION_INVITATION_REVOKED';

ALTER TABLE "Organization" ADD COLUMN "accountType" "OrganizationAccountType" NOT NULL DEFAULT 'INDIVIDUAL';
CREATE INDEX "Organization_accountType_idx" ON "Organization"("accountType");

ALTER TABLE "OrganizationBillingProfile"
  ADD COLUMN "planCode" TEXT NOT NULL DEFAULT 'FREE',
  ADD COLUMN "billingStatus" "BillingStatus" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

CREATE INDEX "OrganizationBillingProfile_billingStatus_idx" ON "OrganizationBillingProfile"("billingStatus");
CREATE INDEX "OrganizationBillingProfile_planCode_idx" ON "OrganizationBillingProfile"("planCode");
CREATE INDEX "OrganizationBillingProfile_stripeCustomerId_idx" ON "OrganizationBillingProfile"("stripeCustomerId");
