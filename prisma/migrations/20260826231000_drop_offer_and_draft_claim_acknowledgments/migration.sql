ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "offerConflictAcknowledgedHash";
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "offerConflictAcknowledgedAt";
ALTER TABLE "EmailDraft" DROP COLUMN IF EXISTS "claimConflictsAcknowledgedAt";
