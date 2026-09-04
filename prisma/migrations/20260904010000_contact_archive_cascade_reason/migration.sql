-- Contact archive provenance for list cascade restore.
CREATE TYPE "ContactArchiveReason" AS ENUM ('DIRECT', 'LIST_CASCADE');

ALTER TABLE "Contact"
  ADD COLUMN "archiveReason" "ContactArchiveReason",
  ADD COLUMN "archivedByListId" TEXT;

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_archivedByListId_fkey"
  FOREIGN KEY ("archivedByListId") REFERENCES "ContactList"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Contact_organizationId_archiveReason_archivedByListId_idx"
  ON "Contact"("organizationId", "archiveReason", "archivedByListId");

CREATE INDEX "Contact_archivedByListId_idx"
  ON "Contact"("archivedByListId");
