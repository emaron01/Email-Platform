-- Phase 3A: ScoringRun framework + ContactScore evolution
-- Additive / safe. Does not reset DB or touch ContactLists/Contacts content.

-- Enums
CREATE TYPE "ScoringRunStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "ScoreLabel" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DISQUALIFIED');
CREATE TYPE "ResearchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NOT_REQUIRED');

-- ScoringRun
CREATE TABLE "ScoringRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "icpId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "status" "ScoringRunStatus" NOT NULL DEFAULT 'PENDING',
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "scoredContacts" INTEGER NOT NULL DEFAULT 0,
    "productSnapshot" JSONB NOT NULL,
    "icpSnapshot" JSONB NOT NULL,
    "personaSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScoringRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScoringRun_organizationId_idx" ON "ScoringRun"("organizationId");
CREATE INDEX "ScoringRun_organizationId_createdAt_idx" ON "ScoringRun"("organizationId", "createdAt");
CREATE INDEX "ScoringRun_organizationId_status_idx" ON "ScoringRun"("organizationId", "status");
CREATE INDEX "ScoringRun_contactListId_idx" ON "ScoringRun"("contactListId");
CREATE INDEX "ScoringRun_organizationId_contactListId_idx" ON "ScoringRun"("organizationId", "contactListId");
CREATE INDEX "ScoringRun_productId_idx" ON "ScoringRun"("productId");
CREATE INDEX "ScoringRun_icpId_idx" ON "ScoringRun"("icpId");
CREATE INDEX "ScoringRun_personaId_idx" ON "ScoringRun"("personaId");

ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_icpId_fkey" FOREIGN KEY ("icpId") REFERENCES "Icp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evolve ContactScore: add scoringRunId + new fields (preserve existing rows if any)
ALTER TABLE "ContactScore" ADD COLUMN "scoringRunId" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "productRelevanceScore" INTEGER;
ALTER TABLE "ContactScore" ADD COLUMN "companySummary" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "whatTheySell" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "estimatedAov" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "aovReasoning" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "fitStrengths" JSONB;
ALTER TABLE "ContactScore" ADD COLUMN "fitRisks" JSONB;
ALTER TABLE "ContactScore" ADD COLUMN "disqualifiers" JSONB;
ALTER TABLE "ContactScore" ADD COLUMN "recommendedAction" TEXT;
ALTER TABLE "ContactScore" ADD COLUMN "researchStatus" "ResearchStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "ContactScore" ADD COLUMN "researchSources" JSONB;
ALTER TABLE "ContactScore" ADD COLUMN "researchedAt" TIMESTAMP(3);

-- Copy legacy strengths/weaknesses into new fit fields when present
UPDATE "ContactScore"
SET "fitStrengths" = COALESCE("fitStrengths", "strengths"),
    "fitRisks" = COALESCE("fitRisks", "weaknesses")
WHERE "strengths" IS NOT NULL OR "weaknesses" IS NOT NULL;

-- Convert overallScore / component scores from float to int (round)
ALTER TABLE "ContactScore" ALTER COLUMN "overallScore" DROP DEFAULT;
ALTER TABLE "ContactScore" ALTER COLUMN "icpScore" DROP DEFAULT;
ALTER TABLE "ContactScore" ALTER COLUMN "personaScore" DROP DEFAULT;
ALTER TABLE "ContactScore" ALTER COLUMN "companyScore" DROP DEFAULT;

ALTER TABLE "ContactScore"
  ALTER COLUMN "overallScore" TYPE INTEGER USING CASE WHEN "overallScore" IS NULL THEN NULL ELSE ROUND("overallScore")::INTEGER END,
  ALTER COLUMN "icpScore" TYPE INTEGER USING CASE WHEN "icpScore" IS NULL THEN NULL ELSE ROUND("icpScore")::INTEGER END,
  ALTER COLUMN "personaScore" TYPE INTEGER USING CASE WHEN "personaScore" IS NULL THEN NULL ELSE ROUND("personaScore")::INTEGER END,
  ALTER COLUMN "companyScore" TYPE INTEGER USING CASE WHEN "companyScore" IS NULL THEN NULL ELSE ROUND("companyScore")::INTEGER END;

-- Convert free-text scoreLabel to enum where possible; otherwise null
ALTER TABLE "ContactScore" ADD COLUMN "scoreLabelEnum" "ScoreLabel";
UPDATE "ContactScore"
SET "scoreLabelEnum" = CASE UPPER(COALESCE("scoreLabel", ''))
  WHEN 'EXCELLENT' THEN 'EXCELLENT'::"ScoreLabel"
  WHEN 'GOOD' THEN 'GOOD'::"ScoreLabel"
  WHEN 'FAIR' THEN 'FAIR'::"ScoreLabel"
  WHEN 'POOR' THEN 'POOR'::"ScoreLabel"
  WHEN 'DISQUALIFIED' THEN 'DISQUALIFIED'::"ScoreLabel"
  ELSE NULL
END;
ALTER TABLE "ContactScore" DROP COLUMN "scoreLabel";
ALTER TABLE "ContactScore" RENAME COLUMN "scoreLabelEnum" TO "scoreLabel";

-- Convert reasoning Json to text (stringify)
ALTER TABLE "ContactScore" ADD COLUMN "reasoningText" TEXT;
UPDATE "ContactScore"
SET "reasoningText" = CASE
  WHEN "reasoning" IS NULL THEN NULL
  WHEN jsonb_typeof("reasoning"::jsonb) = 'string' THEN trim(both '"' from "reasoning"::text)
  ELSE "reasoning"::text
END;
ALTER TABLE "ContactScore" DROP COLUMN "reasoning";
ALTER TABLE "ContactScore" RENAME COLUMN "reasoningText" TO "reasoning";

-- Drop legacy array columns now migrated
ALTER TABLE "ContactScore" DROP COLUMN IF EXISTS "strengths";
ALTER TABLE "ContactScore" DROP COLUMN IF EXISTS "weaknesses";

-- Orphan ContactScore rows (pre-Phase-3A, if any): attach to a migrated ScoringRun
INSERT INTO "ScoringRun" (
  "id",
  "organizationId",
  "contactListId",
  "productId",
  "icpId",
  "personaId",
  "status",
  "totalContacts",
  "scoredContacts",
  "productSnapshot",
  "icpSnapshot",
  "personaSnapshot",
  "createdAt",
  "updatedAt",
  "completedAt"
)
SELECT
  'migrated_score_run_' || cs."id",
  cs."organizationId",
  c."contactListId",
  COALESCE(
    (SELECT p."id" FROM "Product" p WHERE p."organizationId" = cs."organizationId" ORDER BY p."createdAt" ASC LIMIT 1),
    (SELECT p2."id" FROM "Product" p2 LIMIT 1)
  ),
  COALESCE(
    (SELECT i."id" FROM "Icp" i WHERE i."organizationId" = cs."organizationId" ORDER BY i."createdAt" ASC LIMIT 1),
    (SELECT i2."id" FROM "Icp" i2 LIMIT 1)
  ),
  COALESCE(
    (SELECT pe."id" FROM "Persona" pe WHERE pe."organizationId" = cs."organizationId" ORDER BY pe."createdAt" ASC LIMIT 1),
    (SELECT pe2."id" FROM "Persona" pe2 LIMIT 1)
  ),
  'COMPLETED'::"ScoringRunStatus",
  1,
  CASE WHEN cs."overallScore" IS NULL THEN 0 ELSE 1 END,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  cs."createdAt",
  cs."updatedAt",
  cs."updatedAt"
FROM "ContactScore" cs
JOIN "Contact" c ON c."id" = cs."contactId"
WHERE cs."scoringRunId" IS NULL
  AND EXISTS (SELECT 1 FROM "Product" p WHERE p."organizationId" = cs."organizationId")
  AND EXISTS (SELECT 1 FROM "Icp" i WHERE i."organizationId" = cs."organizationId")
  AND EXISTS (SELECT 1 FROM "Persona" pe WHERE pe."organizationId" = cs."organizationId");

UPDATE "ContactScore" cs
SET "scoringRunId" = 'migrated_score_run_' || cs."id"
WHERE cs."scoringRunId" IS NULL
  AND EXISTS (SELECT 1 FROM "ScoringRun" sr WHERE sr."id" = 'migrated_score_run_' || cs."id");

-- Delete any remaining orphan scores that could not be linked (should be none in practice)
DELETE FROM "ContactScore" WHERE "scoringRunId" IS NULL;

ALTER TABLE "ContactScore" ALTER COLUMN "scoringRunId" SET NOT NULL;

ALTER TABLE "ContactScore"
  ADD CONSTRAINT "ContactScore_scoringRunId_fkey"
  FOREIGN KEY ("scoringRunId") REFERENCES "ScoringRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ContactScore_scoringRunId_contactId_key" ON "ContactScore"("scoringRunId", "contactId");
CREATE INDEX "ContactScore_scoringRunId_idx" ON "ContactScore"("scoringRunId");
CREATE INDEX "ContactScore_organizationId_scoringRunId_idx" ON "ContactScore"("organizationId", "scoringRunId");
CREATE INDEX "ContactScore_organizationId_scoreLabel_idx" ON "ContactScore"("organizationId", "scoreLabel");
CREATE INDEX "ContactScore_organizationId_researchStatus_idx" ON "ContactScore"("organizationId", "researchStatus");
