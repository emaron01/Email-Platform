-- AlterTable
ALTER TABLE "ResearchRun" ADD COLUMN "pausedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ResearchRun_status_pausedAt_idx" ON "ResearchRun"("status", "pausedAt");
