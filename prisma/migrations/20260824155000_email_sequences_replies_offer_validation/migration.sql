CREATE TYPE "EmailDraftKind" AS ENUM ('INITIAL', 'FOLLOW_UP', 'REPLY');
CREATE TYPE "ReplyClassification" AS ENUM (
  'INTERESTED',
  'OBJECTION',
  'REFERRAL',
  'NOT_NOW',
  'NOT_INTERESTED'
);
CREATE TYPE "EmailSentMethod" AS ENUM (
  'MANUAL_ASSERTION',
  'CONNECTED_PROVIDER'
);

ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'CAMPAIGN_OFFER_VALIDATED';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'EMAIL_DRAFT_SENT';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'EMAIL_REPLY_CLASSIFIED';

ALTER TABLE "Campaign"
  ADD COLUMN "offerValidationJson" JSONB,
  ADD COLUMN "offerValidationHash" TEXT,
  ADD COLUMN "offerConflictAcknowledgedHash" TEXT,
  ADD COLUMN "offerConflictAcknowledgedAt" TIMESTAMP(3);

ALTER TABLE "EmailDraft"
  ADD COLUMN "kind" "EmailDraftKind" NOT NULL DEFAULT 'INITIAL',
  ADD COLUMN "replyClassification" "ReplyClassification",
  ADD COLUMN "prospectReplyText" TEXT,
  ADD COLUMN "referralSuggested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inReplyToDraftId" TEXT,
  ADD COLUMN "sentMethod" "EmailSentMethod",
  ADD COLUMN "sentByUserId" TEXT;

ALTER TABLE "EmailDraft"
  ADD CONSTRAINT "EmailDraft_inReplyToDraftId_fkey"
  FOREIGN KEY ("inReplyToDraftId") REFERENCES "EmailDraft"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailDraft"
  ADD CONSTRAINT "EmailDraft_sentByUserId_fkey"
  FOREIGN KEY ("sentByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmailDraft_inReplyToDraftId_idx"
  ON "EmailDraft"("inReplyToDraftId");
CREATE INDEX "EmailDraft_sentByUserId_idx"
  ON "EmailDraft"("sentByUserId");
