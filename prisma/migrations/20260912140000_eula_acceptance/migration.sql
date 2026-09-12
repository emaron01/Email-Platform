-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'EULA_PUBLISHED';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'EULA_ACCEPTED';

-- CreateTable
CREATE TABLE "EulaVersion" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,

    CONSTRAINT "EulaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEulaAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eulaVersionId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "UserEulaAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EulaVersion_versionNumber_key" ON "EulaVersion"("versionNumber");

-- CreateIndex
CREATE INDEX "EulaVersion_publishedAt_idx" ON "EulaVersion"("publishedAt");

-- CreateIndex
CREATE INDEX "EulaVersion_createdByUserId_idx" ON "EulaVersion"("createdByUserId");

-- CreateIndex
CREATE INDEX "UserEulaAcceptance_eulaVersionId_idx" ON "UserEulaAcceptance"("eulaVersionId");

-- CreateIndex
CREATE INDEX "UserEulaAcceptance_userId_idx" ON "UserEulaAcceptance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEulaAcceptance_userId_eulaVersionId_key" ON "UserEulaAcceptance"("userId", "eulaVersionId");

-- AddForeignKey
ALTER TABLE "EulaVersion" ADD CONSTRAINT "EulaVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEulaAcceptance" ADD CONSTRAINT "UserEulaAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEulaAcceptance" ADD CONSTRAINT "UserEulaAcceptance_eulaVersionId_fkey" FOREIGN KEY ("eulaVersionId") REFERENCES "EulaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
