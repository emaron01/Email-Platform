-- Shared campaigns are templates only. Production was verified to contain
-- zero CampaignExecution rows and zero CampaignContact rows with executionId.
-- Fail closed if new execution data appeared after that verification.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CampaignExecution" LIMIT 1)
     OR EXISTS (
       SELECT 1 FROM "CampaignContact"
       WHERE "executionId" IS NOT NULL
       LIMIT 1
     )
  THEN
    RAISE EXCEPTION
      'Refusing to remove CampaignExecution: execution data still exists';
  END IF;
END $$;

ALTER TABLE "CampaignContact"
  DROP CONSTRAINT IF EXISTS "CampaignContact_executionId_fkey";

DROP INDEX IF EXISTS "CampaignContact_execution_unique";
DROP INDEX IF EXISTS "CampaignContact_owner_unique";
DROP INDEX IF EXISTS "CampaignContact_executionId_contactId_idx";
DROP INDEX IF EXISTS "CampaignContact_executionId_idx";

ALTER TABLE "CampaignContact" DROP COLUMN "executionId";
DROP TABLE "CampaignExecution";

CREATE UNIQUE INDEX "CampaignContact_organizationId_campaignId_contactId_key"
  ON "CampaignContact"("organizationId", "campaignId", "contactId");
