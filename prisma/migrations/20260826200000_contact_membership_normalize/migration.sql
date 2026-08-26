-- Contact normalization Phase A:
-- - Contact is org-scoped (one person per normalized email when present)
-- - List membership via ContactListMembership
-- - ContactMergeAudit (plain ids, no Contact FK)
-- - ContactList.createdByUserId
-- Unique (organizationId, normalizedEmail) is added in the following migration
-- after optional collapse (see scripts/collapse-contacts.ts).

ALTER TYPE "ContactScoringStatus" ADD VALUE 'UNUSABLE';

ALTER TABLE "ContactList" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "normalizedEmail" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "previousTitle" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "titleChangedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ContactListMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactListMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContactMergeAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "winnerContactId" TEXT NOT NULL,
    "loserContactId" TEXT NOT NULL,
    "normalizedEmail" TEXT,
    "mergePayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMergeAudit_pkey" PRIMARY KEY ("id")
);

-- Backfill memberships from legacy Contact.contactListId (idempotent).
INSERT INTO "ContactListMembership" (
  "id", "organizationId", "contactListId", "contactId", "addedAt", "createdAt"
)
SELECT
  md5(c."id" || ':' || c."contactListId"),
  c."organizationId",
  c."contactListId",
  c."id",
  c."createdAt",
  CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."contactListId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ContactListMembership" m
    WHERE m."contactListId" = c."contactListId"
      AND m."contactId" = c."id"
  );

-- Backfill normalizedEmail (trim, lower, strip +tag) for rows that have email.
UPDATE "Contact" c
SET "normalizedEmail" = (
  lower(split_part(trim(c."email"), '@', 1))
  || '@'
  || lower(split_part(trim(c."email"), '@', 2))
)
WHERE c."email" IS NOT NULL
  AND trim(c."email") <> ''
  AND position('@' in trim(c."email")) > 1
  AND c."normalizedEmail" IS NULL;

-- Strip +tag from local part when present.
UPDATE "Contact" c
SET "normalizedEmail" = (
  split_part(split_part(c."normalizedEmail", '@', 1), '+', 1)
  || '@'
  || split_part(c."normalizedEmail", '@', 2)
)
WHERE c."normalizedEmail" IS NOT NULL
  AND position('+' in split_part(c."normalizedEmail", '@', 1)) > 0;

-- ContactList.createdByUserId: sole org member when exactly one membership exists.
UPDATE "ContactList" cl
SET "createdByUserId" = sole."userId"
FROM (
  SELECT om."organizationId", MIN(om."userId") AS "userId"
  FROM "OrganizationMembership" om
  GROUP BY om."organizationId"
  HAVING COUNT(*) = 1
) sole
WHERE cl."organizationId" = sole."organizationId"
  AND cl."createdByUserId" IS NULL;

-- Drop legacy Contact → ContactList FK and column.
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_contactListId_fkey";
DROP INDEX IF EXISTS "Contact_organizationId_contactListId_idx";
DROP INDEX IF EXISTS "Contact_contactListId_idx";
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "contactListId";

-- Indexes / FKs for new columns and tables.
CREATE INDEX IF NOT EXISTS "ContactList_createdByUserId_idx" ON "ContactList"("createdByUserId");
CREATE INDEX IF NOT EXISTS "ContactList_organizationId_createdByUserId_idx" ON "ContactList"("organizationId", "createdByUserId");

CREATE INDEX IF NOT EXISTS "Contact_organizationId_archivedAt_idx" ON "Contact"("organizationId", "archivedAt");
CREATE INDEX IF NOT EXISTS "Contact_createdByUserId_idx" ON "Contact"("createdByUserId");

CREATE UNIQUE INDEX IF NOT EXISTS "ContactListMembership_contactListId_contactId_key" ON "ContactListMembership"("contactListId", "contactId");
CREATE INDEX IF NOT EXISTS "ContactListMembership_organizationId_idx" ON "ContactListMembership"("organizationId");
CREATE INDEX IF NOT EXISTS "ContactListMembership_contactListId_idx" ON "ContactListMembership"("contactListId");
CREATE INDEX IF NOT EXISTS "ContactListMembership_contactId_idx" ON "ContactListMembership"("contactId");
CREATE INDEX IF NOT EXISTS "ContactListMembership_organizationId_contactId_idx" ON "ContactListMembership"("organizationId", "contactId");
CREATE INDEX IF NOT EXISTS "ContactListMembership_addedByUserId_idx" ON "ContactListMembership"("addedByUserId");

CREATE INDEX IF NOT EXISTS "ContactMergeAudit_organizationId_idx" ON "ContactMergeAudit"("organizationId");
CREATE INDEX IF NOT EXISTS "ContactMergeAudit_organizationId_winnerContactId_idx" ON "ContactMergeAudit"("organizationId", "winnerContactId");
CREATE INDEX IF NOT EXISTS "ContactMergeAudit_organizationId_loserContactId_idx" ON "ContactMergeAudit"("organizationId", "loserContactId");
CREATE INDEX IF NOT EXISTS "ContactMergeAudit_organizationId_normalizedEmail_idx" ON "ContactMergeAudit"("organizationId", "normalizedEmail");
CREATE INDEX IF NOT EXISTS "ContactMergeAudit_createdAt_idx" ON "ContactMergeAudit"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactList_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "ContactList"
      ADD CONSTRAINT "ContactList_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Contact_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Contact"
      ADD CONSTRAINT "Contact_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactListMembership_organizationId_fkey'
  ) THEN
    ALTER TABLE "ContactListMembership"
      ADD CONSTRAINT "ContactListMembership_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactListMembership_contactListId_fkey'
  ) THEN
    ALTER TABLE "ContactListMembership"
      ADD CONSTRAINT "ContactListMembership_contactListId_fkey"
      FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactListMembership_contactId_fkey'
  ) THEN
    ALTER TABLE "ContactListMembership"
      ADD CONSTRAINT "ContactListMembership_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactListMembership_addedByUserId_fkey'
  ) THEN
    ALTER TABLE "ContactListMembership"
      ADD CONSTRAINT "ContactListMembership_addedByUserId_fkey"
      FOREIGN KEY ("addedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactMergeAudit_organizationId_fkey'
  ) THEN
    ALTER TABLE "ContactMergeAudit"
      ADD CONSTRAINT "ContactMergeAudit_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
