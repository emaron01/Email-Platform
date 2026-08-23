-- ICP criterion evidence classing + TARGETED_SEARCH approval + ResearchPolicy cap.
-- Backfill existing rows by heuristic; log assignments via RAISE NOTICE.

CREATE TYPE "CriterionEvidenceClass" AS ENUM (
  'LIST_DATA',
  'COMPANY_RESEARCH',
  'TARGETED_SEARCH',
  'SEMANTIC'
);

CREATE TYPE "TargetedSearchDecision" AS ENUM (
  'KEEP_ASYMMETRIC',
  'MAKE_SUPPORTING',
  'REMOVE'
);

ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "maxTargetedSearchCriteriaPerIcp" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "IcpCriterion"
  ADD COLUMN IF NOT EXISTS "evidenceClass" "CriterionEvidenceClass" NOT NULL DEFAULT 'TARGETED_SEARCH',
  ADD COLUMN IF NOT EXISTS "evidenceClassLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "targetedSearchDecision" "TargetedSearchDecision",
  ADD COLUMN IF NOT EXISTS "targetedSearchDecisionFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "targetedSearchDecidedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "IcpCriterion_organizationId_icpId_evidenceClass_idx"
  ON "IcpCriterion"("organizationId", "icpId", "evidenceClass");

-- Heuristic backfill: known list-data firmographics → LIST_DATA; else TARGETED_SEARCH.
DO $$
DECLARE
  r RECORD;
  assigned "CriterionEvidenceClass";
  list_hit BOOLEAN;
BEGIN
  FOR r IN
    SELECT id, name, "criterionType"
    FROM "IcpCriterion"
  LOOP
    list_hit :=
      lower(r."criterionType") ~ '(industry|employee|revenue|geograph|location|domain)'
      OR lower(r.name) ~ '(industry|employee|revenue|geograph|location|domain|company size)';

    IF list_hit THEN
      assigned := 'LIST_DATA';
    ELSE
      assigned := 'TARGETED_SEARCH';
    END IF;

    UPDATE "IcpCriterion"
    SET "evidenceClass" = assigned
    WHERE id = r.id;

    RAISE NOTICE 'icp_criterion_evidence_backfill id=% name=% type=% assigned=%',
      r.id, r.name, r."criterionType", assigned;
  END LOOP;
END $$;

-- Fix unsplit IN targetValues like ["salesforce.com or hubspot CRM"].
UPDATE "IcpCriterion"
SET
  "targetValue" = to_jsonb(
    ARRAY(
      SELECT trim(both FROM x)
      FROM regexp_split_to_table(
        trim(both '"' FROM ("targetValue" ->> 0)),
        '\s+or\s+|\s+and\s+|,'
      ) AS x
      WHERE trim(both FROM x) <> ''
    )
  ),
  "allowedValues" = to_jsonb(
    ARRAY(
      SELECT trim(both FROM x)
      FROM regexp_split_to_table(
        trim(both '"' FROM ("targetValue" ->> 0)),
        '\s+or\s+|\s+and\s+|,'
      ) AS x
      WHERE trim(both FROM x) <> ''
    )
  )
WHERE "operator" IN ('IN', 'NOT_IN')
  AND jsonb_typeof("targetValue") = 'array'
  AND jsonb_array_length("targetValue") = 1
  AND ("targetValue" ->> 0) ~* '\s+or\s+|\s+and\s+|,';
