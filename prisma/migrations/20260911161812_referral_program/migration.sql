-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_offerId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_personaId_fkey";

-- DropIndex
DROP INDEX "ResearchRun_status_pausedAt_idx";

-- AlterTable
ALTER TABLE "ContactResearch" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IcpCriterion" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PersonaCriterion" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ProductEvidenceBundle_org_product_version_unique" RENAME TO "ProductEvidenceBundle_organizationId_productId_version_key";

-- RenameIndex
ALTER INDEX "ProductSource_org_product_hash_unique" RENAME TO "ProductSource_organizationId_productId_contentHash_key";

-- RenameIndex
ALTER INDEX "ProductTitleDismissal_organizationId_productId_normalizedTitle_" RENAME TO "ProductTitleDismissal_organizationId_productId_normalizedTi_key";

-- RenameIndex
ALTER INDEX "QualificationBucketOverride_org_run_target_key" RENAME TO "QualificationBucketOverride_organizationId_scoringRunId_tar_key";

-- RenameIndex
ALTER INDEX "UsageAlertLedger_organizationId_resource_periodKey_thresholdPer" RENAME TO "UsageAlertLedger_organizationId_resource_periodKey_threshol_key";
