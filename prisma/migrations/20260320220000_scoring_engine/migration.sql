-- Phase 3C: AI scoring provenance + ContactScoringStatus + ScoringRun PARTIAL
-- Additive only.

CREATE TYPE "ContactScoringStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

ALTER TYPE "ScoringRunStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

ALTER TABLE "ContactScore" ADD COLUMN "scoringStatus" "ContactScoringStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ContactScore" ADD COLUMN "assessmentData" JSONB;
ALTER TABLE "ContactScore" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "aiModel" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "aiModelUrlIdentifier" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "promptVersion" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "scoringLogicVersion" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "scoredAt" TIMESTAMP(3);
ALTER TABLE "ContactScore" ADD COLUMN "scoringError" TEXT;

CREATE INDEX "ContactScore_organizationId_scoringStatus_idx" ON "ContactScore"("organizationId", "scoringStatus");
