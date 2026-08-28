-- Persist per-company research stage count and timing for tuning.
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "searchStagesUsed" INTEGER;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "researchStoppedReason" TEXT;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "researchStageTimings" JSONB;
