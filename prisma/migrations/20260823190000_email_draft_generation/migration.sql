-- Record AI provenance on generated drafts and meter draft creation distinctly.

CREATE TYPE "EmailDraftSource" AS ENUM ('AI', 'MANUAL');

ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'EMAIL_DRAFT_CREATED';

ALTER TABLE "EmailDraft"
  ADD COLUMN "source" "EmailDraftSource" NOT NULL DEFAULT 'AI';
