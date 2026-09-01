-- Lookahead pre-generation: track uncommitted quota separately from manual drafts.
ALTER TYPE "EmailDraftSource" ADD VALUE 'AI_LOOKAHEAD';

ALTER TABLE "EmailDraft"
ADD COLUMN "generationQuotaCommitted" BOOLEAN NOT NULL DEFAULT true;
