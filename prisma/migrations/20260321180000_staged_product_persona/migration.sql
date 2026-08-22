-- Staged Product → Persona assisted setup

ALTER TYPE "UsageCategory" ADD VALUE IF NOT EXISTS 'PERSONA_RESEARCH';

ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PERSONA_SOURCE_INGEST';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PERSONA_WEB_SEARCH';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PERSONA_SYNTHESIS';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PERSONA_URL_RETRIEVAL';

CREATE TYPE "PersonaSetupStatus" AS ENUM (
  'NOT_STARTED',
  'RESEARCHING',
  'SYNTHESIZING',
  'NEEDS_REVIEW',
  'APPROVED',
  'PARTIAL',
  'FAILED'
);

ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "maxSearchQueriesPerPersona" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "maxSourcesPerPersona" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "personaResearchFreshnessDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "setupStatus" "PersonaSetupStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "profileJson" JSONB,
  ADD COLUMN IF NOT EXISTS "approvedPersonaSetupRunId" TEXT;

CREATE TABLE IF NOT EXISTS "PersonaSource" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "personaSetupRunId" TEXT,
  "personaId" TEXT,
  "sourceType" "ProductSourceType" NOT NULL,
  "displayName" TEXT NOT NULL,
  "originalUrl" TEXT,
  "normalizedUrlKey" TEXT,
  "filename" TEXT,
  "mimeType" TEXT,
  "byteSize" INTEGER,
  "acquisitionMethod" TEXT NOT NULL,
  "provenanceClass" TEXT NOT NULL DEFAULT 'WEB_EVIDENCE',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retrievedAt" TIMESTAMP(3),
  "contentHash" TEXT NOT NULL,
  "status" "ProductSourceStatus" NOT NULL DEFAULT 'PENDING',
  "errorSafe" TEXT,
  "extractedText" TEXT,
  "freshnessExpiresAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  CONSTRAINT "PersonaSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PersonaEvidenceBundle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "personaSetupRunId" TEXT,
  "version" INTEGER NOT NULL,
  "correlationId" TEXT NOT NULL,
  "status" "PersonaSetupStatus" NOT NULL DEFAULT 'RESEARCHING',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "normalizedEvidenceJson" JSONB,
  "sourceIdsJson" JSONB,
  "productEvidenceBundleId" TEXT,
  "webSearchQueriesUsed" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PersonaEvidenceBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PersonaSetupRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "personaId" TEXT,
  "productEvidenceBundleId" TEXT NOT NULL,
  "personaEvidenceBundleId" TEXT,
  "correlationId" TEXT NOT NULL,
  "status" "PersonaSetupStatus" NOT NULL DEFAULT 'SYNTHESIZING',
  "selectedBuyerRoleJson" JSONB,
  "suggestionKey" TEXT,
  "userContextJson" JSONB,
  "personaDraftJson" JSONB,
  "synthesisPromptVersion" TEXT,
  "aiProvider" TEXT,
  "aiModel" TEXT,
  "errorSafe" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PersonaSetupRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PersonaSource_organizationId_contentHash_key"
  ON "PersonaSource"("organizationId", "contentHash");
CREATE INDEX IF NOT EXISTS "PersonaSource_organizationId_idx" ON "PersonaSource"("organizationId");
CREATE INDEX IF NOT EXISTS "PersonaSource_productId_idx" ON "PersonaSource"("productId");
CREATE INDEX IF NOT EXISTS "PersonaSource_personaSetupRunId_idx" ON "PersonaSource"("personaSetupRunId");
CREATE INDEX IF NOT EXISTS "PersonaSource_organizationId_normalizedUrlKey_idx"
  ON "PersonaSource"("organizationId", "normalizedUrlKey");

CREATE INDEX IF NOT EXISTS "PersonaEvidenceBundle_organizationId_idx" ON "PersonaEvidenceBundle"("organizationId");
CREATE INDEX IF NOT EXISTS "PersonaEvidenceBundle_productId_idx" ON "PersonaEvidenceBundle"("productId");
CREATE INDEX IF NOT EXISTS "PersonaEvidenceBundle_correlationId_idx" ON "PersonaEvidenceBundle"("correlationId");

CREATE INDEX IF NOT EXISTS "PersonaSetupRun_organizationId_idx" ON "PersonaSetupRun"("organizationId");
CREATE INDEX IF NOT EXISTS "PersonaSetupRun_productId_idx" ON "PersonaSetupRun"("productId");
CREATE INDEX IF NOT EXISTS "PersonaSetupRun_personaId_idx" ON "PersonaSetupRun"("personaId");
CREATE INDEX IF NOT EXISTS "PersonaSetupRun_correlationId_idx" ON "PersonaSetupRun"("correlationId");

ALTER TABLE "PersonaSource"
  ADD CONSTRAINT "PersonaSource_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaSource"
  ADD CONSTRAINT "PersonaSource_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonaEvidenceBundle"
  ADD CONSTRAINT "PersonaEvidenceBundle_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaEvidenceBundle"
  ADD CONSTRAINT "PersonaEvidenceBundle_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaEvidenceBundle"
  ADD CONSTRAINT "PersonaEvidenceBundle_productEvidenceBundleId_fkey"
  FOREIGN KEY ("productEvidenceBundleId") REFERENCES "ProductEvidenceBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PersonaSetupRun"
  ADD CONSTRAINT "PersonaSetupRun_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaSetupRun"
  ADD CONSTRAINT "PersonaSetupRun_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaSetupRun"
  ADD CONSTRAINT "PersonaSetupRun_productEvidenceBundleId_fkey"
  FOREIGN KEY ("productEvidenceBundleId") REFERENCES "ProductEvidenceBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonaSetupRun"
  ADD CONSTRAINT "PersonaSetupRun_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
