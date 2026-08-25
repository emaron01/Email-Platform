-- ICP criterion PRIMARY/SECONDARY tier + mandatory flag.
-- Existing TARGETED_SEARCH criteria become SECONDARY; everything else PRIMARY.
-- isMandatory is never inferred — always false until a user sets it.

CREATE TYPE "IcpCriterionTier" AS ENUM (
  'PRIMARY',
  'SECONDARY'
);

ALTER TABLE "IcpCriterion"
  ADD COLUMN IF NOT EXISTS "tier" "IcpCriterionTier" NOT NULL DEFAULT 'PRIMARY',
  ADD COLUMN IF NOT EXISTS "isMandatory" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "IcpCriterion_organizationId_icpId_tier_idx"
  ON "IcpCriterion"("organizationId", "icpId", "tier");

DO $$
DECLARE
  r RECORD;
  assigned "IcpCriterionTier";
BEGIN
  FOR r IN
    SELECT id, name, "criterionType", "evidenceClass"
    FROM "IcpCriterion"
  LOOP
    IF r."evidenceClass" = 'TARGETED_SEARCH' THEN
      assigned := 'SECONDARY';
    ELSE
      assigned := 'PRIMARY';
    END IF;

    UPDATE "IcpCriterion"
    SET
      "tier" = assigned,
      "isMandatory" = false
    WHERE id = r.id;

    RAISE NOTICE 'icp_criterion_tier_backfill id=% name=% type=% evidenceClass=% tier=% isMandatory=false',
      r.id, r.name, r."criterionType", r."evidenceClass", assigned;
  END LOOP;
END $$;
