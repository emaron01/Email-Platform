-- Persist a plain-language interpretation read-back without touching Icp.definition.

ALTER TABLE "Icp"
  ADD COLUMN IF NOT EXISTS "interpretationSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "interpretationUndetermined" TEXT;
