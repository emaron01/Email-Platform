ALTER TABLE "CompanyResearch"
ADD COLUMN "identityAmbiguous" BOOLEAN NOT NULL DEFAULT false;

-- Preserve known legacy ambiguity where the provider already recorded the
-- entity-resolution failure in risk signals before the boolean was persisted.
UPDATE "CompanyResearch"
SET "identityAmbiguous" = true
WHERE "researchMethod" = 'AUTOMATED'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof("riskSignals"::jsonb) = 'array'
          THEN "riskSignals"::jsonb
        ELSE '[]'::jsonb
      END
    ) AS signal(value)
    WHERE signal.value ~* '(entity[- ]resolution|identity[^.]*ambiguous|domain[^.]*mismatch|location[^.]*mismatch)'
  );
