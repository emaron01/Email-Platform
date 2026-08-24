CREATE TYPE "EmailSendRecordMethod" AS ENUM (
  'DEEPLINK_INTENT',
  'MICROSOFT_GRAPH'
);
ALTER TYPE "UsageResource" ADD VALUE IF NOT EXISTS 'EMAIL_SEND';

ALTER TABLE "OrganizationUsagePolicy"
  ADD COLUMN "dailyEmailSendWarningLimit" INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN "dailyEmailSendLimit" INTEGER NOT NULL DEFAULT 250;

ALTER TABLE "UserUsageOverride"
  ADD COLUMN "dailyEmailSendWarningLimit" INTEGER,
  ADD COLUMN "dailyEmailSendLimit" INTEGER;

ALTER TABLE "EmailDraft" ADD COLUMN "generatedBody" TEXT;
UPDATE "EmailDraft" SET "generatedBody" = "body" WHERE "body" IS NOT NULL;

CREATE TABLE "EmailSendRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "emailDraftId" TEXT NOT NULL,
  "campaignContactId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "generatedBody" TEXT NOT NULL,
  "finalBody" TEXT NOT NULL,
  "sentByUserId" TEXT NOT NULL,
  "method" "EmailSendRecordMethod" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "providerMessageId" TEXT,
  "providerRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSendRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailSendRecord_organizationId_occurredAt_idx"
  ON "EmailSendRecord"("organizationId", "occurredAt");
CREATE INDEX "EmailSendRecord_organizationId_sentByUserId_occurredAt_idx"
  ON "EmailSendRecord"("organizationId", "sentByUserId", "occurredAt");
CREATE INDEX "EmailSendRecord_emailDraftId_idx"
  ON "EmailSendRecord"("emailDraftId");
CREATE INDEX "EmailSendRecord_campaignContactId_idx"
  ON "EmailSendRecord"("campaignContactId");
CREATE INDEX "EmailSendRecord_providerMessageId_idx"
  ON "EmailSendRecord"("providerMessageId");

ALTER TABLE "EmailSendRecord"
  ADD CONSTRAINT "EmailSendRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSendRecord"
  ADD CONSTRAINT "EmailSendRecord_emailDraftId_fkey"
  FOREIGN KEY ("emailDraftId") REFERENCES "EmailDraft"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSendRecord"
  ADD CONSTRAINT "EmailSendRecord_campaignContactId_fkey"
  FOREIGN KEY ("campaignContactId") REFERENCES "CampaignContact"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSendRecord"
  ADD CONSTRAINT "EmailSendRecord_sentByUserId_fkey"
  FOREIGN KEY ("sentByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
