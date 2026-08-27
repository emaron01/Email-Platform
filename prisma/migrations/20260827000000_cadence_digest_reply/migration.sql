-- Cadence policy, daily digest, sequence stop tracking, and reply context.

CREATE TYPE "SequenceStopReason" AS ENUM (
  'SUPPRESSED',
  'CAMPAIGN_ARCHIVED',
  'THEY_REPLIED',
  'MAX_SEQUENCE',
  'MANUAL_STOP',
  'EXCLUDED'
);

ALTER TYPE "TransactionalEmailTemplateKey" ADD VALUE 'CADENCE_DAILY_DIGEST';

ALTER TABLE "User"
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "digestSendTimeLocal" TEXT NOT NULL DEFAULT '08:00';

ALTER TABLE "CampaignContact"
  ADD COLUMN "sequenceStoppedAt" TIMESTAMP(3),
  ADD COLUMN "sequenceStoppedReason" "SequenceStopReason",
  ADD COLUMN "sequenceStoppedByUserId" TEXT,
  ADD COLUMN "nextDueAt" TIMESTAMP(3);

ALTER TABLE "EmailDraft"
  ADD COLUMN "repReplyContext" TEXT;

CREATE TABLE "OrganizationCadencePolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "day2IntervalDays" INTEGER NOT NULL DEFAULT 9,
  "day3IntervalDays" INTEGER NOT NULL DEFAULT 6,
  "day4IntervalDays" INTEGER NOT NULL DEFAULT 15,
  "repeatIntervalDays" INTEGER NOT NULL DEFAULT 30,
  "maxSequenceEmails" INTEGER DEFAULT 4,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrganizationCadencePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyDigestSend" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "dueCount" INTEGER NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyDigestSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationCadencePolicy_organizationId_key" ON "OrganizationCadencePolicy"("organizationId");

CREATE UNIQUE INDEX "DailyDigestSend_userId_periodKey_key" ON "DailyDigestSend"("userId", "periodKey");
CREATE INDEX "DailyDigestSend_organizationId_idx" ON "DailyDigestSend"("organizationId");
CREATE INDEX "DailyDigestSend_userId_idx" ON "DailyDigestSend"("userId");
CREATE INDEX "DailyDigestSend_periodKey_idx" ON "DailyDigestSend"("periodKey");

CREATE INDEX "CampaignContact_organizationId_nextDueAt_idx" ON "CampaignContact"("organizationId", "nextDueAt");
CREATE INDEX "CampaignContact_nextDueAt_idx" ON "CampaignContact"("nextDueAt");

ALTER TABLE "CampaignContact"
  ADD CONSTRAINT "CampaignContact_sequenceStoppedByUserId_fkey"
  FOREIGN KEY ("sequenceStoppedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationCadencePolicy"
  ADD CONSTRAINT "OrganizationCadencePolicy_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyDigestSend"
  ADD CONSTRAINT "DailyDigestSend_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyDigestSend"
  ADD CONSTRAINT "DailyDigestSend_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
