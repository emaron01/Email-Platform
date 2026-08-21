-- CreateEnum
CREATE TYPE "ContactListSource" AS ENUM ('PASTE', 'UPLOAD');

-- AlterTable
ALTER TABLE "ContactList" ADD COLUMN "sourceType" "ContactListSource" NOT NULL DEFAULT 'UPLOAD';

-- CreateIndex
CREATE INDEX "ContactList_organizationId_sourceType_idx" ON "ContactList"("organizationId", "sourceType");
