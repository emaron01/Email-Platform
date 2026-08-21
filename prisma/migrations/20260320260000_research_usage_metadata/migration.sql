-- Phase: OpenAI Responses research usage metadata (additive)
-- Does not reset DB or delete existing research/score records.

ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "webSearchCallCount" INTEGER;
ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "researchDurationMs" INTEGER;
