-- Additive: usage policy, research policy, metering, invitations, timezone.
-- Safe backfill for existing Organizations. Does not destroy tenant data.

-- CreateEnum
CREATE TYPE "UsageCategory" AS ENUM ('RESEARCH', 'SCORING', 'EMAIL_GENERATION');

-- CreateEnum
CREATE TYPE "UsageOperation" AS ENUM ('WEB_SEARCH', 'RESEARCH_SYNTHESIS', 'CONTACT_SCORING', 'EMAIL_GENERATION');

-- CreateEnum
CREATE TYPE "UsageEventStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'RETRY');

-- CreateEnum
CREATE TYPE "UsageResource" AS ENUM ('EMAIL_GENERATION', 'ACTIVE_RESEARCHED_COMPANY');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "CompanyResearch" ADD COLUMN "researchedByUserId" TEXT;

-- CreateTable
CREATE TABLE "OrganizationUsagePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "activeResearchedCompanyLimit" INTEGER NOT NULL,
    "dailyEmailGenerationLimit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationUsagePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "maxSearchQueriesPerCompany" INTEGER NOT NULL,
    "maxSourcesPerCompany" INTEGER NOT NULL,
    "researchFreshnessDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUsageOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeResearchedCompanyLimit" INTEGER,
    "dailyEmailGenerationLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUsageOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "category" "UsageCategory" NOT NULL,
    "operation" "UsageOperation" NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "scoringRunId" TEXT,
    "campaignId" TEXT,
    "operationId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "webSearchCalls" INTEGER,
    "status" "UsageEventStatus" NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageQuotaLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" "UsageResource" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageQuotaLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationUsagePolicy_organizationId_key" ON "OrganizationUsagePolicy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchPolicy_organizationId_key" ON "ResearchPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "UserUsageOverride_organizationId_idx" ON "UserUsageOverride"("organizationId");

-- CreateIndex
CREATE INDEX "UserUsageOverride_userId_idx" ON "UserUsageOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserUsageOverride_organizationId_userId_key" ON "UserUsageOverride"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_idx" ON "UsageEvent"("organizationId");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_occurredAt_idx" ON "UsageEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_userId_idx" ON "UsageEvent"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_category_idx" ON "UsageEvent"("organizationId", "category");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_operation_idx" ON "UsageEvent"("organizationId", "operation");

-- CreateIndex
CREATE INDEX "UsageEvent_operationId_idx" ON "UsageEvent"("operationId");

-- CreateIndex
CREATE INDEX "UsageEvent_companyId_idx" ON "UsageEvent"("companyId");

-- CreateIndex
CREATE INDEX "UsageEvent_scoringRunId_idx" ON "UsageEvent"("scoringRunId");

-- CreateIndex
CREATE INDEX "UsageQuotaLedger_organizationId_idx" ON "UsageQuotaLedger"("organizationId");

-- CreateIndex
CREATE INDEX "UsageQuotaLedger_organizationId_userId_idx" ON "UsageQuotaLedger"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "UsageQuotaLedger_organizationId_resource_periodKey_idx" ON "UsageQuotaLedger"("organizationId", "resource", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "UsageQuotaLedger_organizationId_userId_resource_periodKey_key" ON "UsageQuotaLedger"("organizationId", "userId", "resource", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_idx" ON "OrganizationInvitation"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_email_idx" ON "OrganizationInvitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_status_idx" ON "OrganizationInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_email_idx" ON "OrganizationInvitation"("email");

-- CreateIndex
CREATE INDEX "CompanyResearch_researchedByUserId_idx" ON "CompanyResearch"("researchedByUserId");

-- AddForeignKey
ALTER TABLE "OrganizationUsagePolicy" ADD CONSTRAINT "OrganizationUsagePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPolicy" ADD CONSTRAINT "ResearchPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsageOverride" ADD CONSTRAINT "UserUsageOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsageOverride" ADD CONSTRAINT "UserUsageOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageQuotaLedger" ADD CONSTRAINT "UsageQuotaLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageQuotaLedger" ADD CONSTRAINT "UsageQuotaLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyResearch" ADD CONSTRAINT "CompanyResearch_researchedByUserId_fkey" FOREIGN KEY ("researchedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill OrganizationUsagePolicy for existing orgs (defaults as initial config values).
INSERT INTO "OrganizationUsagePolicy" ("id", "organizationId", "activeResearchedCompanyLimit", "dailyEmailGenerationLimit", "createdAt", "updatedAt")
SELECT
  'oup_' || o."id",
  o."id",
  100,
  35,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrganizationUsagePolicy" p WHERE p."organizationId" = o."id"
);

-- Backfill ResearchPolicy for existing orgs.
INSERT INTO "ResearchPolicy" ("id", "organizationId", "maxSearchQueriesPerCompany", "maxSourcesPerCompany", "researchFreshnessDays", "createdAt", "updatedAt")
SELECT
  'rp_' || o."id",
  o."id",
  3,
  8,
  90,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "ResearchPolicy" p WHERE p."organizationId" = o."id"
);
