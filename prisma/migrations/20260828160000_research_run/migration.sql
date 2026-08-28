-- CreateEnum
CREATE TYPE "ResearchRunStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "scoringRunId" TEXT,
    "status" "ResearchRunStatus" NOT NULL DEFAULT 'PENDING',
    "forceRefresh" BOOLEAN NOT NULL DEFAULT false,
    "failuresOnly" BOOLEAN NOT NULL DEFAULT false,
    "retryOfRunId" TEXT,
    "totalCompanies" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedFreshCount" INTEGER NOT NULL DEFAULT 0,
    "quotaBlockedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCompanyIds" JSONB,
    "processedCompanyIds" JSONB,
    "quotaBlockedCompanyIds" JSONB,
    "quotaBlockedCompanyNames" JSONB,
    "currentCompanyId" TEXT,
    "currentCompanyName" TEXT,
    "lastError" TEXT,
    "initiatedByUserId" TEXT,
    "workerHeartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- One active run per contact list (PENDING or IN_PROGRESS).
CREATE UNIQUE INDEX "ResearchRun_contactListId_active_key"
ON "ResearchRun" ("contactListId")
WHERE "status" IN ('PENDING', 'IN_PROGRESS');

-- CreateIndex
CREATE INDEX "ResearchRun_organizationId_idx" ON "ResearchRun"("organizationId");

-- CreateIndex
CREATE INDEX "ResearchRun_contactListId_idx" ON "ResearchRun"("contactListId");

-- CreateIndex
CREATE INDEX "ResearchRun_organizationId_contactListId_status_idx" ON "ResearchRun"("organizationId", "contactListId", "status");

-- CreateIndex
CREATE INDEX "ResearchRun_status_workerHeartbeatAt_idx" ON "ResearchRun"("status", "workerHeartbeatAt");

-- CreateIndex
CREATE INDEX "ResearchRun_scoringRunId_idx" ON "ResearchRun"("scoringRunId");

-- CreateIndex
CREATE INDEX "ResearchRun_initiatedByUserId_idx" ON "ResearchRun"("initiatedByUserId");

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_scoringRunId_fkey" FOREIGN KEY ("scoringRunId") REFERENCES "ScoringRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_retryOfRunId_fkey" FOREIGN KEY ("retryOfRunId") REFERENCES "ResearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
