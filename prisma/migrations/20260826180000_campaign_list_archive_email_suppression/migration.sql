-- Campaign/list soft-archive plus organization-level email suppression.

ALTER TYPE "ContactScoringStatus" ADD VALUE 'SUPPRESSED';

CREATE TYPE "EmailSuppressionReason" AS ENUM ('OPTED_OUT', 'BOUNCED', 'DO_NOT_CONTACT');

CREATE TYPE "EmailSuppressionStatus" AS ENUM ('ACTIVE', 'RELEASED');

ALTER TABLE "Campaign" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "ContactList" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Campaign_organizationId_archivedAt_idx" ON "Campaign"("organizationId", "archivedAt");

CREATE INDEX "ContactList_organizationId_archivedAt_idx" ON "ContactList"("organizationId", "archivedAt");

CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "status" "EmailSuppressionStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "suppressedById" TEXT NOT NULL,
    "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSuppression_organizationId_normalizedEmail_key" ON "EmailSuppression"("organizationId", "normalizedEmail");

CREATE INDEX "EmailSuppression_organizationId_status_idx" ON "EmailSuppression"("organizationId", "status");

CREATE INDEX "EmailSuppression_organizationId_normalizedEmail_idx" ON "EmailSuppression"("organizationId", "normalizedEmail");

CREATE INDEX "EmailSuppression_suppressedById_idx" ON "EmailSuppression"("suppressedById");

CREATE INDEX "EmailSuppression_releasedById_idx" ON "EmailSuppression"("releasedById");

ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_suppressedById_fkey" FOREIGN KEY ("suppressedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
