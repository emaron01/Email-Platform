-- Exclusion testability for persona disqualifier criteria (title vs evidence).
-- Existing rows remain NULL until re-approved or re-projected.

CREATE TYPE "ExclusionTestability" AS ENUM ('TITLE_TESTABLE', 'EVIDENCE_TESTABLE');

ALTER TABLE "PersonaCriterion"
  ADD COLUMN IF NOT EXISTS "exclusionTestability" "ExclusionTestability";
