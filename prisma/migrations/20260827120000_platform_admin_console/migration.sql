-- Platform admin console (Phase A): suspension fields, credit grants,
-- usage alert ledger, audit actions, usage-limit warning template.
-- Strip unused billing address/tax/companyLegalName PII — keep billingEmail only.

-- AlterEnum AdminAuditAction
ALTER TYPE "AdminAuditAction" ADD VALUE 'PLATFORM_ORG_LISTED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'PLATFORM_ORG_VIEWED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'ORGANIZATION_SUSPENDED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'ORGANIZATION_UNSUSPENDED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'PLATFORM_USAGE_POLICY_CHANGED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'ORGANIZATION_CREDIT_GRANTED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'USAGE_LIMIT_ALERT_SENT';

-- AlterEnum TransactionalEmailTemplateKey
ALTER TYPE "TransactionalEmailTemplateKey" ADD VALUE 'USAGE_LIMIT_WARNING';

-- CreateEnum UsageAlertResource
CREATE TYPE "UsageAlertResource" AS ENUM ('ACTIVE_COMPANY', 'EMAIL_GENERATION');

-- AlterTable Organization
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedReason" TEXT,
ADD COLUMN "suspendedByUserId" TEXT;

CREATE INDEX "Organization_suspendedAt_idx" ON "Organization"("suspendedAt");

-- AlterTable OrganizationBillingProfile — drop address/tax/legal PII
ALTER TABLE "OrganizationBillingProfile" DROP COLUMN IF EXISTS "companyLegalName",
DROP COLUMN IF EXISTS "taxId",
DROP COLUMN IF EXISTS "addressLine1",
DROP COLUMN IF EXISTS "addressLine2",
DROP COLUMN IF EXISTS "city",
DROP COLUMN IF EXISTS "region",
DROP COLUMN IF EXISTS "postalCode",
DROP COLUMN IF EXISTS "countryCode";

-- CreateTable OrganizationCreditGrant
CREATE TABLE "OrganizationCreditGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationCreditGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationCreditGrant_organizationId_idx" ON "OrganizationCreditGrant"("organizationId");
CREATE INDEX "OrganizationCreditGrant_organizationId_createdAt_idx" ON "OrganizationCreditGrant"("organizationId", "createdAt");
CREATE INDEX "OrganizationCreditGrant_grantedByUserId_idx" ON "OrganizationCreditGrant"("grantedByUserId");

ALTER TABLE "OrganizationCreditGrant" ADD CONSTRAINT "OrganizationCreditGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationCreditGrant" ADD CONSTRAINT "OrganizationCreditGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable UsageAlertLedger
CREATE TABLE "UsageAlertLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resource" "UsageAlertResource" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "thresholdPercent" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageAlertLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageAlertLedger_organizationId_resource_periodKey_thresholdPercent_key" ON "UsageAlertLedger"("organizationId", "resource", "periodKey", "thresholdPercent");
CREATE INDEX "UsageAlertLedger_organizationId_idx" ON "UsageAlertLedger"("organizationId");
CREATE INDEX "UsageAlertLedger_organizationId_resource_periodKey_idx" ON "UsageAlertLedger"("organizationId", "resource", "periodKey");

ALTER TABLE "UsageAlertLedger" ADD CONSTRAINT "UsageAlertLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
