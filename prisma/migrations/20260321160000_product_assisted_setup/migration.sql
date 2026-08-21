-- Additive: Product assisted setup / evidence bundles / sources / policy freshness

-- Usage enums
ALTER TYPE "UsageCategory" ADD VALUE IF NOT EXISTS 'PRODUCT_RESEARCH';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PRODUCT_URL_RETRIEVAL';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PRODUCT_WEB_SEARCH';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PRODUCT_DOCUMENT_EXTRACTION';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PRODUCT_SYNTHESIS';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PRODUCT_SOURCE_INGEST';

-- New enums
DO $$ BEGIN
  CREATE TYPE "ProductSourceType" AS ENUM ('URL', 'PASTED_TEXT', 'UPLOADED_DOCUMENT', 'USER_NOTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProductSourceStatus" AS ENUM (
    'PENDING', 'ACQUIRED', 'EXTRACTED', 'FAILED', 'DUPLICATE', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProductSetupStatus" AS ENUM (
    'NOT_STARTED', 'ACQUIRING', 'SYNTHESIZING', 'NEEDS_REVIEW', 'APPROVED', 'PARTIAL', 'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProductApprovalStatus" AS ENUM (
    'NOT_STARTED', 'DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ResearchPolicy: product URL freshness (DB default 120; enforcement reads DB)
ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "productSourceResearchFreshnessDays" INTEGER NOT NULL DEFAULT 120;

ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "maxSearchQueriesPerProduct" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "maxSourcesPerProduct" INTEGER NOT NULL DEFAULT 12;

-- Product approval + extended profile (Json) — additive
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "approvalStatus" "ProductApprovalStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "approvedEvidenceBundleId" TEXT;
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "approvedSetupRunId" TEXT;
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "profileJson" JSONB;
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "messagingJson" JSONB;
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "manuallyEditedFields" JSONB;
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "setupStatus" "ProductSetupStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- Persona approval (additive)
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "approvalStatus" "ProductApprovalStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "approvedEvidenceBundleId" TEXT;
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "approvedSetupRunId" TEXT;
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "manuallyEditedFields" JSONB;
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "suggestionKey" TEXT;
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "whyThisPersonaMatters" TEXT;
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "personaMessagingJson" JSONB;

-- ProductSource
CREATE TABLE IF NOT EXISTS "ProductSource" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sourceType" "ProductSourceType" NOT NULL,
  "displayName" TEXT NOT NULL,
  "originalUrl" TEXT,
  "normalizedUrlKey" TEXT,
  "filename" TEXT,
  "mimeType" TEXT,
  "byteSize" INTEGER,
  "acquisitionMethod" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retrievedAt" TIMESTAMP(3),
  "contentHash" TEXT NOT NULL,
  "status" "ProductSourceStatus" NOT NULL DEFAULT 'PENDING',
  "errorSafe" TEXT,
  "extractedText" TEXT,
  "freshnessExpiresAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  CONSTRAINT "ProductSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductSource_organizationId_idx" ON "ProductSource"("organizationId");
CREATE INDEX IF NOT EXISTS "ProductSource_productId_idx" ON "ProductSource"("productId");
CREATE INDEX IF NOT EXISTS "ProductSource_organizationId_productId_idx" ON "ProductSource"("organizationId", "productId");
CREATE INDEX IF NOT EXISTS "ProductSource_organizationId_contentHash_idx" ON "ProductSource"("organizationId", "contentHash");
CREATE INDEX IF NOT EXISTS "ProductSource_organizationId_normalizedUrlKey_idx" ON "ProductSource"("organizationId", "normalizedUrlKey");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSource_org_product_hash_unique"
  ON "ProductSource"("organizationId", "productId", "contentHash");

-- Durable blob storage in Postgres (not Render ephemeral disk)
CREATE TABLE IF NOT EXISTS "ProductSourceBlob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductSourceBlob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSourceBlob_sourceId_key" ON "ProductSourceBlob"("sourceId");
CREATE INDEX IF NOT EXISTS "ProductSourceBlob_organizationId_idx" ON "ProductSourceBlob"("organizationId");

-- Evidence bundle (versioned)
CREATE TABLE IF NOT EXISTS "ProductEvidenceBundle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "parentBundleId" TEXT,
  "correlationId" TEXT NOT NULL,
  "status" "ProductSetupStatus" NOT NULL DEFAULT 'ACQUIRING',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "normalizedEvidenceJson" JSONB,
  "sourceIdsJson" JSONB NOT NULL,
  "urlResearchPerformed" BOOLEAN NOT NULL DEFAULT false,
  "webSearchQueriesUsed" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductEvidenceBundle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductEvidenceBundle_organizationId_idx" ON "ProductEvidenceBundle"("organizationId");
CREATE INDEX IF NOT EXISTS "ProductEvidenceBundle_productId_idx" ON "ProductEvidenceBundle"("productId");
CREATE INDEX IF NOT EXISTS "ProductEvidenceBundle_organizationId_productId_idx" ON "ProductEvidenceBundle"("organizationId", "productId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductEvidenceBundle_org_product_version_unique"
  ON "ProductEvidenceBundle"("organizationId", "productId", "version");

-- Setup / synthesis run
CREATE TABLE IF NOT EXISTS "ProductSetupRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "evidenceBundleId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "status" "ProductSetupStatus" NOT NULL DEFAULT 'SYNTHESIZING',
  "productDraftJson" JSONB,
  "messagingDraftJson" JSONB,
  "suggestedPersonasJson" JSONB,
  "personaDraftsJson" JSONB,
  "synthesisPromptVersion" TEXT,
  "aiProvider" TEXT,
  "aiModel" TEXT,
  "errorSafe" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ProductSetupRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductSetupRun_organizationId_idx" ON "ProductSetupRun"("organizationId");
CREATE INDEX IF NOT EXISTS "ProductSetupRun_productId_idx" ON "ProductSetupRun"("productId");
CREATE INDEX IF NOT EXISTS "ProductSetupRun_evidenceBundleId_idx" ON "ProductSetupRun"("evidenceBundleId");
CREATE INDEX IF NOT EXISTS "ProductSetupRun_correlationId_idx" ON "ProductSetupRun"("correlationId");

-- FKs
DO $$ BEGIN
  ALTER TABLE "ProductSource" ADD CONSTRAINT "ProductSource_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSource" ADD CONSTRAINT "ProductSource_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSourceBlob" ADD CONSTRAINT "ProductSourceBlob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSourceBlob" ADD CONSTRAINT "ProductSourceBlob_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "ProductSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductEvidenceBundle" ADD CONSTRAINT "ProductEvidenceBundle_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductEvidenceBundle" ADD CONSTRAINT "ProductEvidenceBundle_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSetupRun" ADD CONSTRAINT "ProductSetupRun_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSetupRun" ADD CONSTRAINT "ProductSetupRun_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSetupRun" ADD CONSTRAINT "ProductSetupRun_evidenceBundleId_fkey"
    FOREIGN KEY ("evidenceBundleId") REFERENCES "ProductEvidenceBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
