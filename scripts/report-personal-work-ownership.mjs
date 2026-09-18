if (process.argv.includes("--test")) {
  if (!process.env.TEST_DATABASE_URL?.trim()) {
    throw new Error("TEST_DATABASE_URL is required with --test.");
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const [ambiguousLists, ambiguousCampaigns, ambiguousContacts, splitContacts] =
    await Promise.all([
      prisma.$queryRaw`
        SELECT
          cl."id",
          cl."organizationId",
          cl."name",
          cl."createdByUserId",
          COALESCE(
            array_agg(om."userId" ORDER BY om."userId")
              FILTER (WHERE om."userId" IS NOT NULL),
            ARRAY[]::TEXT[]
          ) AS "memberUserIds"
        FROM "ContactList" cl
        LEFT JOIN "OrganizationMembership" om
          ON om."organizationId" = cl."organizationId"
        LEFT JOIN "OrganizationMembership" creator
          ON creator."organizationId" = cl."organizationId"
         AND creator."userId" = cl."createdByUserId"
        WHERE creator."userId" IS NULL
        GROUP BY cl."id", cl."organizationId", cl."name", cl."createdByUserId"
        HAVING COUNT(om."userId") <> 1
        ORDER BY cl."organizationId", cl."createdAt", cl."id"
      `,
      prisma.$queryRaw`
        SELECT
          c."id",
          c."organizationId",
          c."name",
          c."ownerUserId",
          COALESCE(
            array_agg(om."userId" ORDER BY om."userId")
              FILTER (WHERE om."userId" IS NOT NULL),
            ARRAY[]::TEXT[]
          ) AS "memberUserIds"
        FROM "Campaign" c
        LEFT JOIN "OrganizationMembership" om
          ON om."organizationId" = c."organizationId"
        LEFT JOIN "OrganizationMembership" owner_member
          ON owner_member."organizationId" = c."organizationId"
         AND owner_member."userId" = c."ownerUserId"
        WHERE owner_member."userId" IS NULL
        GROUP BY c."id", c."organizationId", c."name", c."ownerUserId"
        HAVING COUNT(om."userId") <> 1
        ORDER BY c."organizationId", c."createdAt", c."id"
      `,
      prisma.$queryRaw`
        WITH structural_owner AS (
          SELECT m."contactId", cl."ownerCandidate"
          FROM "ContactListMembership" m
          JOIN (
            SELECT
              cl."id",
              COALESCE(valid_creator."userId", sole."userId") AS "ownerCandidate"
            FROM "ContactList" cl
            LEFT JOIN "OrganizationMembership" valid_creator
              ON valid_creator."organizationId" = cl."organizationId"
             AND valid_creator."userId" = cl."createdByUserId"
            LEFT JOIN (
              SELECT "organizationId", MIN("userId") AS "userId"
              FROM "OrganizationMembership"
              GROUP BY "organizationId"
              HAVING COUNT(*) = 1
            ) sole ON sole."organizationId" = cl."organizationId"
          ) cl ON cl."id" = m."contactListId"
          WHERE cl."ownerCandidate" IS NOT NULL
          UNION
          SELECT cs."contactId", cl."ownerCandidate"
          FROM "ContactScore" cs
          JOIN "ScoringRun" sr ON sr."id" = cs."scoringRunId"
          JOIN (
            SELECT
              cl."id",
              COALESCE(valid_creator."userId", sole."userId") AS "ownerCandidate"
            FROM "ContactList" cl
            LEFT JOIN "OrganizationMembership" valid_creator
              ON valid_creator."organizationId" = cl."organizationId"
             AND valid_creator."userId" = cl."createdByUserId"
            LEFT JOIN (
              SELECT "organizationId", MIN("userId") AS "userId"
              FROM "OrganizationMembership"
              GROUP BY "organizationId"
              HAVING COUNT(*) = 1
            ) sole ON sole."organizationId" = cl."organizationId"
          ) cl ON cl."id" = sr."contactListId"
          WHERE cl."ownerCandidate" IS NOT NULL
          UNION
          SELECT cc."contactId", COALESCE(valid_owner."userId", sole."userId")
          FROM "CampaignContact" cc
          JOIN "Campaign" c ON c."id" = cc."campaignId"
          LEFT JOIN "OrganizationMembership" valid_owner
            ON valid_owner."organizationId" = c."organizationId"
           AND valid_owner."userId" = c."ownerUserId"
          LEFT JOIN (
            SELECT "organizationId", MIN("userId") AS "userId"
            FROM "OrganizationMembership"
            GROUP BY "organizationId"
            HAVING COUNT(*) = 1
          ) sole ON sole."organizationId" = c."organizationId"
          WHERE COALESCE(valid_owner."userId", sole."userId") IS NOT NULL
        )
        SELECT
          c."id",
          c."organizationId",
          c."email",
          c."createdByUserId",
          COALESCE(
            array_agg(om."userId" ORDER BY om."userId")
              FILTER (WHERE om."userId" IS NOT NULL),
            ARRAY[]::TEXT[]
          ) AS "memberUserIds"
        FROM "Contact" c
        LEFT JOIN "OrganizationMembership" om
          ON om."organizationId" = c."organizationId"
        LEFT JOIN structural_owner so ON so."contactId" = c."id"
        LEFT JOIN "OrganizationMembership" valid_creator
          ON valid_creator."organizationId" = c."organizationId"
         AND valid_creator."userId" = c."createdByUserId"
        WHERE so."contactId" IS NULL
          AND valid_creator."userId" IS NULL
        GROUP BY c."id", c."organizationId", c."email", c."createdByUserId"
        HAVING COUNT(om."userId") <> 1
        ORDER BY c."organizationId", c."createdAt", c."id"
      `,
      prisma.$queryRaw`
        WITH owners AS (
          SELECT m."contactId", cl."createdByUserId" AS "ownerUserId"
          FROM "ContactListMembership" m
          JOIN "ContactList" cl ON cl."id" = m."contactListId"
          WHERE cl."createdByUserId" IS NOT NULL
          UNION
          SELECT cs."contactId", cl."createdByUserId"
          FROM "ContactScore" cs
          JOIN "ScoringRun" sr ON sr."id" = cs."scoringRunId"
          JOIN "ContactList" cl ON cl."id" = sr."contactListId"
          WHERE cl."createdByUserId" IS NOT NULL
          UNION
          SELECT cc."contactId", c."ownerUserId"
          FROM "CampaignContact" cc
          JOIN "Campaign" c ON c."id" = cc."campaignId"
          WHERE c."ownerUserId" IS NOT NULL
        )
        SELECT
          c."id",
          c."organizationId",
          c."email",
          array_agg(DISTINCT o."ownerUserId" ORDER BY o."ownerUserId") AS "ownerUserIds"
        FROM "Contact" c
        JOIN owners o ON o."contactId" = c."id"
        GROUP BY c."id", c."organizationId", c."email"
        HAVING COUNT(DISTINCT o."ownerUserId") > 1
        ORDER BY c."organizationId", c."createdAt", c."id"
      `,
    ]);

  const report = {
    generatedAt: new Date().toISOString(),
    blockers: {
      lists: ambiguousLists,
      campaigns: ambiguousCampaigns,
      contacts: ambiguousContacts,
    },
    contactsThatWillBeCloned: splitContacts,
    resolution: {
      lists:
        'Set "ContactList"."createdByUserId" to an active member of the same organization.',
      campaigns:
        'Set "Campaign"."ownerUserId" to an active member of the same organization.',
      contacts:
        'Set "Contact"."createdByUserId" to an active member when the contact has no list, score, or campaign owner.',
    },
  };
  console.log(JSON.stringify(report, null, 2));

  const blockerCount =
    ambiguousLists.length + ambiguousCampaigns.length + ambiguousContacts.length;
  if (blockerCount > 0) {
    console.error(
      `Personal-work ownership preflight found ${blockerCount} ambiguous row(s). Resolve the reported IDs, then rerun this command before deploying the migration.`,
    );
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error("Unable to report personal-work ownership.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
