-- Per-draft length override, the persona used to generate, and the
-- personalization snapshot so regenerate and the draft screen stay aligned.
ALTER TABLE "EmailDraft" ADD COLUMN IF NOT EXISTS "emailLength" "EmailLength";
ALTER TABLE "EmailDraft" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
ALTER TABLE "EmailDraft" ADD COLUMN IF NOT EXISTS "personalizationTier" TEXT;
ALTER TABLE "EmailDraft" ADD COLUMN IF NOT EXISTS "personalizationSources" TEXT;
