-- Phase 2.5: Product-owned ICPs/Personas + campaign-level offers
-- Additive / backfilling only. Does not drop ContactLists, Contacts, or Offer rows.

-- 1) Add nullable product ownership columns
ALTER TABLE "Icp" ADD COLUMN "productId" TEXT;
ALTER TABLE "Persona" ADD COLUMN "productId" TEXT;

-- 2) Prefer an existing Product in the same organization (DEV seed product first)
UPDATE "Icp" AS i
SET "productId" = (
  SELECT p."id"
  FROM "Product" AS p
  WHERE p."organizationId" = i."organizationId"
  ORDER BY
    CASE WHEN p."name" LIKE '[DEV]%' THEN 0 ELSE 1 END,
    p."createdAt" ASC
  LIMIT 1
)
WHERE i."productId" IS NULL;

UPDATE "Persona" AS pe
SET "productId" = (
  SELECT p."id"
  FROM "Product" AS p
  WHERE p."organizationId" = pe."organizationId"
  ORDER BY
    CASE WHEN p."name" LIKE '[DEV]%' THEN 0 ELSE 1 END,
    p."createdAt" ASC
  LIMIT 1
)
WHERE pe."productId" IS NULL;

-- 3) For any remaining orphans, create a migrated placeholder Product per org
INSERT INTO "Product" ("id", "organizationId", "name", "description", "createdAt", "updatedAt")
SELECT
  'migrated_product_' || o."id",
  o."id",
  '[MIGRATED] Unassigned Product',
  'Auto-created during Phase 2.5 migration to preserve existing ICP/Persona rows.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" AS o
WHERE EXISTS (
  SELECT 1 FROM "Icp" AS i WHERE i."organizationId" = o."id" AND i."productId" IS NULL
)
OR EXISTS (
  SELECT 1 FROM "Persona" AS pe WHERE pe."organizationId" = o."id" AND pe."productId" IS NULL
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Icp" AS i
SET "productId" = 'migrated_product_' || i."organizationId"
WHERE i."productId" IS NULL;

UPDATE "Persona" AS pe
SET "productId" = 'migrated_product_' || pe."organizationId"
WHERE pe."productId" IS NULL;

-- 4) Enforce product ownership
ALTER TABLE "Icp" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "Persona" ALTER COLUMN "productId" SET NOT NULL;

ALTER TABLE "Icp"
  ADD CONSTRAINT "Icp_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Persona"
  ADD CONSTRAINT "Persona_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Icp_productId_idx" ON "Icp"("productId");
CREATE INDEX "Icp_organizationId_productId_idx" ON "Icp"("organizationId", "productId");
CREATE INDEX "Persona_productId_idx" ON "Persona"("productId");
CREATE INDEX "Persona_organizationId_productId_idx" ON "Persona"("organizationId", "productId");

-- 5) Campaign: persona + campaign-specific offer fields; keep Offer table link optional
ALTER TABLE "Campaign" ADD COLUMN "personaId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "offerName" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "offerDescription" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "offerCta" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "offerNotes" TEXT;

UPDATE "Campaign" AS c
SET
  "offerName" = o."name",
  "offerDescription" = o."description",
  "offerCta" = o."primaryCta",
  "offerNotes" = o."notes"
FROM "Offer" AS o
WHERE c."offerId" = o."id"
  AND c."offerName" IS NULL;

UPDATE "Campaign" AS c
SET "personaId" = (
  SELECT pe."id"
  FROM "Persona" AS pe
  WHERE pe."productId" = c."productId"
    AND pe."organizationId" = c."organizationId"
  ORDER BY pe."createdAt" ASC
  LIMIT 1
)
WHERE c."personaId" IS NULL;

-- Placeholder personas for campaigns that still lack one
INSERT INTO "Persona" (
  "id",
  "organizationId",
  "productId",
  "name",
  "messagingNotes",
  "createdAt",
  "updatedAt"
)
SELECT
  'migrated_persona_' || c."id",
  c."organizationId",
  c."productId",
  '[MIGRATED] Campaign Persona',
  'Auto-created during Phase 2.5 migration for an existing campaign.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Campaign" AS c
WHERE c."personaId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "Campaign" AS c
SET "personaId" = 'migrated_persona_' || c."id"
WHERE c."personaId" IS NULL;

ALTER TABLE "Campaign" ALTER COLUMN "personaId" SET NOT NULL;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Campaign_personaId_idx" ON "Campaign"("personaId");

-- 6) Offer FK becomes optional for new campaign-level offers
ALTER TABLE "Campaign" ALTER COLUMN "offerId" DROP NOT NULL;
