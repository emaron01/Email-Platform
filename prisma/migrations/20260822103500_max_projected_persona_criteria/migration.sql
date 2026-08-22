-- Cap projected Persona criteria from AI signal arrays (default 15).
ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "maxProjectedPersonaCriteria" INTEGER NOT NULL DEFAULT 15;
