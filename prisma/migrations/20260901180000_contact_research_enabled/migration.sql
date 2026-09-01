ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "contactResearchEnabled" BOOLEAN NOT NULL DEFAULT false;
