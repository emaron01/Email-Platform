-- All-personas scoring: nullable ScoringRun.personaId, personaSnapshots array,
-- and per-contact matched persona + assessment audit on ContactScore.

ALTER TABLE "ScoringRun"
  ALTER COLUMN "personaId" DROP NOT NULL;

ALTER TABLE "ScoringRun"
  ADD COLUMN IF NOT EXISTS "personaSnapshots" JSONB NOT NULL DEFAULT '[]';

UPDATE "ScoringRun"
SET "personaSnapshots" = jsonb_build_array("personaSnapshot")
WHERE ("personaSnapshots" = '[]'::jsonb OR "personaSnapshots" IS NULL)
  AND "personaSnapshot" IS NOT NULL;

ALTER TABLE "ContactScore"
  ADD COLUMN IF NOT EXISTS "matchedPersonaId" TEXT,
  ADD COLUMN IF NOT EXISTS "matchedPersonaSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "personaAssessments" JSONB;

CREATE INDEX IF NOT EXISTS "ContactScore_matchedPersonaId_idx"
  ON "ContactScore"("matchedPersonaId");

ALTER TABLE "ContactScore"
  DROP CONSTRAINT IF EXISTS "ContactScore_matchedPersonaId_fkey";

ALTER TABLE "ContactScore"
  ADD CONSTRAINT "ContactScore_matchedPersonaId_fkey"
  FOREIGN KEY ("matchedPersonaId") REFERENCES "Persona"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
