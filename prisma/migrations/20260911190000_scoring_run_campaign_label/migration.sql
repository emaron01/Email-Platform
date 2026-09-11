-- AlterTable
ALTER TABLE "ScoringRun" ADD COLUMN "label" TEXT;
ALTER TABLE "ScoringRun" ADD COLUMN "sourceCampaignId" TEXT;

-- CreateIndex
CREATE INDEX "ScoringRun_sourceCampaignId_idx" ON "ScoringRun"("sourceCampaignId");

-- AddForeignKey
ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_sourceCampaignId_fkey" FOREIGN KEY ("sourceCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
