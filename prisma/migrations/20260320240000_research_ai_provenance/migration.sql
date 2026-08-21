-- Phase 3C refactor: CompanyResearch automated provenance (additive)
-- Does not reset DB or delete existing research/score records.

ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "aiModel" TEXT;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "aiModelUrlIdentifier" TEXT;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "promptVersion" TEXT;
