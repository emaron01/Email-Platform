-- Personal work ownership:
-- - ContactList and Contact gain required owners.
-- - Campaign legacy null owners are resolved before becoming required.
-- - Contacts shared by multiple work owners are cloned; list/scoring history
--   follows the list owner and campaign/draft/send history follows campaign owner.
-- - Company/CompanyResearch and EmailSuppression remain organization-wide.
--
-- Run `npm run db:personal-ownership-report` before deploy. It prints exact
-- ambiguous IDs and exits non-zero so they can be resolved before this migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ContactList" cl
    LEFT JOIN "OrganizationMembership" creator
      ON creator."organizationId" = cl."organizationId"
     AND creator."userId" = cl."createdByUserId"
    WHERE creator."userId" IS NULL
      AND (SELECT COUNT(*) FROM "OrganizationMembership" om
           WHERE om."organizationId" = cl."organizationId") <> 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous ContactList ownership remains. Run npm run db:personal-ownership-report and resolve the reported rows.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Campaign" c
    LEFT JOIN "OrganizationMembership" owner_member
      ON owner_member."organizationId" = c."organizationId"
     AND owner_member."userId" = c."ownerUserId"
    WHERE owner_member."userId" IS NULL
      AND (SELECT COUNT(*) FROM "OrganizationMembership" om
           WHERE om."organizationId" = c."organizationId") <> 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous Campaign ownership remains. Run npm run db:personal-ownership-report and resolve the reported rows.';
  END IF;
END $$;

ALTER TABLE "ContactList" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "ownerUserId" TEXT;

-- Preserve known creators as owners only when they are members of the same org.
UPDATE "ContactList" cl
SET "ownerUserId" = om."userId"
FROM "OrganizationMembership" om
WHERE om."organizationId" = cl."organizationId"
  AND om."userId" = cl."createdByUserId";

-- Remaining sole-member lists and campaigns have one unambiguous owner.
WITH sole AS (
  SELECT "organizationId", MIN("userId") AS "userId"
  FROM "OrganizationMembership"
  GROUP BY "organizationId"
  HAVING COUNT(*) = 1
)
UPDATE "ContactList" cl
SET "ownerUserId" = sole."userId",
    "createdByUserId" = COALESCE(cl."createdByUserId", sole."userId")
FROM sole
WHERE cl."organizationId" = sole."organizationId"
  AND cl."ownerUserId" IS NULL;

WITH sole AS (
  SELECT "organizationId", MIN("userId") AS "userId"
  FROM "OrganizationMembership"
  GROUP BY "organizationId"
  HAVING COUNT(*) = 1
)
UPDATE "Campaign" c
SET "ownerUserId" = sole."userId"
FROM sole
WHERE c."organizationId" = sole."organizationId"
  AND NOT EXISTS (
    SELECT 1 FROM "OrganizationMembership" owner_member
    WHERE owner_member."organizationId" = c."organizationId"
      AND owner_member."userId" = c."ownerUserId"
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ContactList" WHERE "ownerUserId" IS NULL) THEN
    RAISE EXCEPTION 'ContactList owner backfill incomplete. Run npm run db:personal-ownership-report.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Campaign" WHERE "ownerUserId" IS NULL) THEN
    RAISE EXCEPTION 'Campaign owner backfill incomplete. Run npm run db:personal-ownership-report.';
  END IF;
END $$;

-- Derive every owner whose personal work references a contact. Structural
-- ownership wins; createdBy is only a fallback for otherwise-unlisted contacts.
CREATE TEMP TABLE "_ContactOwnerCandidate" ON COMMIT DROP AS
SELECT DISTINCT m."contactId", cl."ownerUserId"
FROM "ContactListMembership" m
JOIN "ContactList" cl ON cl."id" = m."contactListId"
UNION
SELECT DISTINCT cs."contactId", cl."ownerUserId"
FROM "ContactScore" cs
JOIN "ScoringRun" sr ON sr."id" = cs."scoringRunId"
JOIN "ContactList" cl ON cl."id" = sr."contactListId"
UNION
SELECT DISTINCT cc."contactId", c."ownerUserId"
FROM "CampaignContact" cc
JOIN "Campaign" c ON c."id" = cc."campaignId";

INSERT INTO "_ContactOwnerCandidate" ("contactId", "ownerUserId")
SELECT c."id", creator."userId"
FROM "Contact" c
JOIN "OrganizationMembership" creator
  ON creator."organizationId" = c."organizationId"
 AND creator."userId" = c."createdByUserId"
WHERE NOT EXISTS (
  SELECT 1 FROM "_ContactOwnerCandidate" candidate
  WHERE candidate."contactId" = c."id"
);

INSERT INTO "_ContactOwnerCandidate" ("contactId", "ownerUserId")
SELECT c."id", sole."userId"
FROM "Contact" c
JOIN (
  SELECT "organizationId", MIN("userId") AS "userId"
  FROM "OrganizationMembership"
  GROUP BY "organizationId"
  HAVING COUNT(*) = 1
) sole ON sole."organizationId" = c."organizationId"
WHERE NOT EXISTS (
  SELECT 1 FROM "_ContactOwnerCandidate" candidate
  WHERE candidate."contactId" = c."id"
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Contact" c
    WHERE NOT EXISTS (
      SELECT 1 FROM "_ContactOwnerCandidate" candidate
      WHERE candidate."contactId" = c."id"
    )
  ) THEN
    RAISE EXCEPTION 'Ambiguous unowned Contact rows remain. Run npm run db:personal-ownership-report and resolve the reported rows.';
  END IF;
END $$;

CREATE TEMP TABLE "_ContactOwnerAssignment" ON COMMIT DROP AS
SELECT
  ranked."contactId",
  ranked."ownerUserId",
  ranked."ownerRank",
  CASE
    WHEN ranked."ownerRank" = 1 THEN ranked."contactId"
    ELSE 'owned_' || md5(ranked."contactId" || ':' || ranked."ownerUserId")
  END AS "targetContactId"
FROM (
  SELECT
    candidate."contactId",
    candidate."ownerUserId",
    ROW_NUMBER() OVER (
      PARTITION BY candidate."contactId"
      ORDER BY
        CASE WHEN candidate."ownerUserId" = c."createdByUserId" THEN 0 ELSE 1 END,
        candidate."ownerUserId"
    ) AS "ownerRank"
  FROM "_ContactOwnerCandidate" candidate
  JOIN "Contact" c ON c."id" = candidate."contactId"
) ranked;

UPDATE "Contact" c
SET "ownerUserId" = assignment."ownerUserId"
FROM "_ContactOwnerAssignment" assignment
WHERE assignment."contactId" = c."id"
  AND assignment."ownerRank" = 1;

-- Clone the contact itself for every additional owner. Company identity remains
-- shared through the copied companyId; no Company or CompanyResearch is cloned.
INSERT INTO "Contact"
SELECT (
  jsonb_populate_record(
    NULL::"Contact",
    to_jsonb(c) || jsonb_build_object(
      'id', assignment."targetContactId",
      'ownerUserId', assignment."ownerUserId",
      'createdByUserId', COALESCE(c."createdByUserId", assignment."ownerUserId"),
      'archivedAt',
        CASE
          WHEN c."archiveReason"::text = 'LIST_CASCADE'
           AND NOT EXISTS (
             SELECT 1 FROM "ContactList" archived_list
             WHERE archived_list."id" = c."archivedByListId"
               AND archived_list."ownerUserId" = assignment."ownerUserId"
           )
          THEN NULL
          ELSE c."archivedAt"
        END,
      'archiveReason',
        CASE
          WHEN c."archiveReason"::text = 'LIST_CASCADE'
           AND NOT EXISTS (
             SELECT 1 FROM "ContactList" archived_list
             WHERE archived_list."id" = c."archivedByListId"
               AND archived_list."ownerUserId" = assignment."ownerUserId"
           )
          THEN NULL
          ELSE c."archiveReason"
        END,
      'archivedByListId',
        CASE
          WHEN EXISTS (
            SELECT 1 FROM "ContactList" archived_list
            WHERE archived_list."id" = c."archivedByListId"
              AND archived_list."ownerUserId" = assignment."ownerUserId"
          )
          THEN c."archivedByListId"
          ELSE NULL
        END
    )
  )
).*
FROM "_ContactOwnerAssignment" assignment
JOIN "Contact" c ON c."id" = assignment."contactId"
WHERE assignment."ownerRank" > 1;

-- Contact-level research is copied so each owner keeps the existing result.
-- CompanyResearch is intentionally not copied because it remains org-shared.
INSERT INTO "ContactResearch"
SELECT (
  jsonb_populate_record(
    NULL::"ContactResearch",
    to_jsonb(cr) || jsonb_build_object(
      'id', 'owned_research_' || md5(cr."id" || ':' || assignment."ownerUserId"),
      'contactId', assignment."targetContactId"
    )
  )
).*
FROM "_ContactOwnerAssignment" assignment
JOIN "ContactResearch" cr ON cr."contactId" = assignment."contactId"
WHERE assignment."ownerRank" > 1;

-- Lists and scores follow the list owner.
UPDATE "ContactListMembership" membership
SET "contactId" = assignment."targetContactId"
FROM "ContactList" list_row, "_ContactOwnerAssignment" assignment
WHERE list_row."id" = membership."contactListId"
  AND assignment."contactId" = membership."contactId"
  AND assignment."ownerUserId" = list_row."ownerUserId";

UPDATE "ContactScore" score
SET "contactId" = assignment."targetContactId"
FROM "ScoringRun" run, "ContactList" list_row, "_ContactOwnerAssignment" assignment
WHERE run."id" = score."scoringRunId"
  AND list_row."id" = run."contactListId"
  AND assignment."contactId" = score."contactId"
  AND assignment."ownerUserId" = list_row."ownerUserId";

-- Campaign contacts carry their drafts and send records with them through their
-- stable CampaignContact id, so only the Contact reference changes.
UPDATE "CampaignContact" campaign_contact
SET "contactId" = assignment."targetContactId"
FROM "Campaign" campaign, "_ContactOwnerAssignment" assignment
WHERE campaign."id" = campaign_contact."campaignId"
  AND assignment."contactId" = campaign_contact."contactId"
  AND assignment."ownerUserId" = campaign."ownerUserId";

-- A LIST_CASCADE archive cannot point across owner boundaries.
UPDATE "Contact" c
SET "archivedAt" = NULL,
    "archiveReason" = NULL,
    "archivedByListId" = NULL
WHERE c."archiveReason" = 'LIST_CASCADE'
  AND NOT EXISTS (
    SELECT 1 FROM "ContactList" cl
    WHERE cl."id" = c."archivedByListId"
      AND cl."ownerUserId" = c."ownerUserId"
  );

ALTER TABLE "ContactList" ALTER COLUMN "ownerUserId" SET NOT NULL;
ALTER TABLE "Contact" ALTER COLUMN "ownerUserId" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "ownerUserId" SET NOT NULL;

DROP INDEX IF EXISTS "Contact_organizationId_normalizedEmail_key";
CREATE UNIQUE INDEX "Contact_organizationId_ownerUserId_normalizedEmail_key"
  ON "Contact"("organizationId", "ownerUserId", "normalizedEmail");
CREATE INDEX "ContactList_organizationId_ownerUserId_idx"
  ON "ContactList"("organizationId", "ownerUserId");
CREATE INDEX "Contact_organizationId_ownerUserId_idx"
  ON "Contact"("organizationId", "ownerUserId");

ALTER TABLE "ContactList"
  ADD CONSTRAINT "ContactList_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_ownerUserId_fkey";
ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
