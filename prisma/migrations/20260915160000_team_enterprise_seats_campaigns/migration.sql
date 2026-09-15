-- Team / Enterprise seats + shared campaign executions

-- CreateEnum
CREATE TYPE "CampaignVisibility" AS ENUM ('PERSONAL', 'SHARED');

-- AlterTable OrganizationBillingProfile
ALTER TABLE "OrganizationBillingProfile" ADD COLUMN "seatQuantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OrganizationBillingProfile" ADD COLUMN "maxSeats" INTEGER NOT NULL DEFAULT 1;

-- AlterTable Campaign
ALTER TABLE "Campaign" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "visibility" "CampaignVisibility" NOT NULL DEFAULT 'PERSONAL';

-- CreateTable CampaignExecution
CREATE TABLE "CampaignExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignExecution_pkey" PRIMARY KEY ("id")
);

-- AlterTable CampaignContact
ALTER TABLE "CampaignContact" ADD COLUMN "executionId" TEXT;

-- Drop old unique (owner-scoped contacts only)
DROP INDEX IF EXISTS "CampaignContact_organizationId_campaignId_contactId_key";

-- Indexes
CREATE INDEX "Campaign_organizationId_visibility_idx" ON "Campaign"("organizationId", "visibility");
CREATE INDEX "Campaign_ownerUserId_idx" ON "Campaign"("ownerUserId");

CREATE INDEX "CampaignExecution_organizationId_idx" ON "CampaignExecution"("organizationId");
CREATE INDEX "CampaignExecution_campaignId_idx" ON "CampaignExecution"("campaignId");
CREATE INDEX "CampaignExecution_userId_idx" ON "CampaignExecution"("userId");
CREATE INDEX "CampaignExecution_organizationId_campaignId_userId_createdAt_idx" ON "CampaignExecution"("organizationId", "campaignId", "userId", "createdAt");

CREATE INDEX "CampaignContact_organizationId_campaignId_contactId_idx" ON "CampaignContact"("organizationId", "campaignId", "contactId");
CREATE INDEX "CampaignContact_executionId_idx" ON "CampaignContact"("executionId");
CREATE INDEX "CampaignContact_executionId_contactId_idx" ON "CampaignContact"("executionId", "contactId");

-- Partial uniques: owner contacts vs execution contacts
CREATE UNIQUE INDEX "CampaignContact_owner_unique"
  ON "CampaignContact"("organizationId", "campaignId", "contactId")
  WHERE "executionId" IS NULL;
CREATE UNIQUE INDEX "CampaignContact_execution_unique"
  ON "CampaignContact"("executionId", "contactId")
  WHERE "executionId" IS NOT NULL;

-- Foreign keys
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "CampaignExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
