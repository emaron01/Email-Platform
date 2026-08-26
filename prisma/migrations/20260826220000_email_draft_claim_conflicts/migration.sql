-- Persist claim-guard findings on the draft so generation can keep the copy
-- and ask the rep to edit or acknowledge instead of discarding it.

ALTER TABLE "EmailDraft" ADD COLUMN "claimConflictsJson" JSONB;
ALTER TABLE "EmailDraft" ADD COLUMN "claimConflictsAcknowledgedAt" TIMESTAMP(3);
