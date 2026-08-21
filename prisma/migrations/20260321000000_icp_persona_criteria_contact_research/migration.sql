-- Additive migration: ICP/Persona natural-language definitions, structured criteria,
-- ContactResearch, research policy contact limits, usage/audit enums, score provenance.

-- Enums
CREATE TYPE "CriterionDataType" AS ENUM ('TEXT', 'NUMBER', 'CURRENCY', 'BOOLEAN', 'ENUM', 'MULTI_SELECT', 'DATE');
CREATE TYPE "CriterionOperator" AS ENUM (
  'EQUALS', 'NOT_EQUALS', 'CONTAINS', 'IN', 'NOT_IN',
  'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL',
  'BETWEEN', 'EXISTS', 'NOT_EXISTS'
);
CREATE TYPE "CriterionImportance" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "CriterionSource" AS ENUM ('AI_INTERPRETED', 'MANUAL', 'MIGRATED_FROM_LEGACY');
CREATE TYPE "ContactResearchStatus" AS ENUM (
  'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL', 'NOT_REQUIRED'
);

ALTER TYPE "UsageCategory" ADD VALUE IF NOT EXISTS 'CONTACT_RESEARCH';
ALTER TYPE "UsageCategory" ADD VALUE IF NOT EXISTS 'INTERPRETATION';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'CONTACT_RESEARCH_SYNTHESIS';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'ICP_INTERPRETATION';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'PERSONA_INTERPRETATION';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'ICP_INTERPRETED';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'ICP_CRITERION_CHANGED';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'PERSONA_INTERPRETED';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'PERSONA_CRITERION_CHANGED';

-- ResearchPolicy contact limits
ALTER TABLE "ResearchPolicy"
  ADD COLUMN IF NOT EXISTS "maxSearchQueriesPerContact" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "maxSourcesPerContact" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "contactResearchFreshnessDays" INTEGER NOT NULL DEFAULT 90;

-- ICP natural language + interpretation metadata
ALTER TABLE "Icp"
  ADD COLUMN IF NOT EXISTS "definition" TEXT,
  ADD COLUMN IF NOT EXISTS "additionalContext" TEXT,
  ADD COLUMN IF NOT EXISTS "interpretationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "interpretationPromptVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "lastInterpretedAt" TIMESTAMP(3);

-- Persona natural language + interpretation metadata
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "definition" TEXT,
  ADD COLUMN IF NOT EXISTS "additionalContext" TEXT,
  ADD COLUMN IF NOT EXISTS "interpretationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "interpretationPromptVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "lastInterpretedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "IcpCriterion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "icpId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "criterionType" TEXT NOT NULL,
  "dataType" "CriterionDataType" NOT NULL,
  "operator" "CriterionOperator" NOT NULL,
  "targetValue" JSONB,
  "minValue" JSONB,
  "maxValue" JSONB,
  "allowedValues" JSONB,
  "importance" "CriterionImportance" NOT NULL DEFAULT 'MEDIUM',
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isDisqualifier" BOOLEAN NOT NULL DEFAULT false,
  "researchGuidance" TEXT,
  "source" "CriterionSource" NOT NULL DEFAULT 'AI_INTERPRETED',
  "confidence" "ResearchConfidence",
  "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IcpCriterion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PersonaCriterion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "criterionType" TEXT NOT NULL,
  "dataType" "CriterionDataType" NOT NULL,
  "operator" "CriterionOperator" NOT NULL,
  "targetValue" JSONB,
  "minValue" JSONB,
  "maxValue" JSONB,
  "allowedValues" JSONB,
  "importance" "CriterionImportance" NOT NULL DEFAULT 'MEDIUM',
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isDisqualifier" BOOLEAN NOT NULL DEFAULT false,
  "researchGuidance" TEXT,
  "source" "CriterionSource" NOT NULL DEFAULT 'AI_INTERPRETED',
  "confidence" "ResearchConfidence",
  "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaCriterion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContactResearch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "ContactResearchStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "researchMethod" "ResearchMethod" NOT NULL DEFAULT 'AUTOMATED',
  "confidence" "ResearchConfidence",
  "currentTitle" TEXT,
  "roleSummary" TEXT,
  "responsibilities" JSONB,
  "ownershipAreas" JSONB,
  "professionalSignals" JSONB,
  "negativeRoleSignals" JSONB,
  "researchSources" JSONB,
  "researchedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "aiProvider" TEXT,
  "aiModel" TEXT,
  "aiModelUrlIdentifier" TEXT,
  "promptVersion" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "webSearchCallCount" INTEGER,
  "researchDurationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactResearch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ContactScore"
  ADD COLUMN IF NOT EXISTS "companyResearchId" TEXT,
  ADD COLUMN IF NOT EXISTS "companyResearchAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contactResearchId" TEXT,
  ADD COLUMN IF NOT EXISTS "contactResearchAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "criterionAssessments" JSONB;

-- FKs
DO $$ BEGIN
  ALTER TABLE "IcpCriterion" ADD CONSTRAINT "IcpCriterion_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "IcpCriterion" ADD CONSTRAINT "IcpCriterion_icpId_fkey"
    FOREIGN KEY ("icpId") REFERENCES "Icp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PersonaCriterion" ADD CONSTRAINT "PersonaCriterion_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PersonaCriterion" ADD CONSTRAINT "PersonaCriterion_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContactResearch" ADD CONSTRAINT "ContactResearch_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContactResearch" ADD CONSTRAINT "ContactResearch_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ContactResearch_organizationId_contactId_key"
  ON "ContactResearch"("organizationId", "contactId");

CREATE INDEX IF NOT EXISTS "IcpCriterion_organizationId_idx" ON "IcpCriterion"("organizationId");
CREATE INDEX IF NOT EXISTS "IcpCriterion_icpId_idx" ON "IcpCriterion"("icpId");
CREATE INDEX IF NOT EXISTS "IcpCriterion_organizationId_icpId_idx" ON "IcpCriterion"("organizationId", "icpId");
CREATE INDEX IF NOT EXISTS "IcpCriterion_organizationId_icpId_sortOrder_idx" ON "IcpCriterion"("organizationId", "icpId", "sortOrder");

CREATE INDEX IF NOT EXISTS "PersonaCriterion_organizationId_idx" ON "PersonaCriterion"("organizationId");
CREATE INDEX IF NOT EXISTS "PersonaCriterion_personaId_idx" ON "PersonaCriterion"("personaId");
CREATE INDEX IF NOT EXISTS "PersonaCriterion_organizationId_personaId_idx" ON "PersonaCriterion"("organizationId", "personaId");
CREATE INDEX IF NOT EXISTS "PersonaCriterion_organizationId_personaId_sortOrder_idx" ON "PersonaCriterion"("organizationId", "personaId", "sortOrder");

CREATE INDEX IF NOT EXISTS "ContactResearch_organizationId_idx" ON "ContactResearch"("organizationId");
CREATE INDEX IF NOT EXISTS "ContactResearch_contactId_idx" ON "ContactResearch"("contactId");
CREATE INDEX IF NOT EXISTS "ContactResearch_organizationId_status_idx" ON "ContactResearch"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "ContactResearch_expiresAt_idx" ON "ContactResearch"("expiresAt");

-- Backfill: copy description → definition when definition is null
UPDATE "Icp"
SET "definition" = "description"
WHERE "definition" IS NULL AND "description" IS NOT NULL AND length(trim("description")) > 0;

UPDATE "Persona"
SET "definition" = COALESCE("responsibilities", "messagingNotes")
WHERE "definition" IS NULL
  AND (
    ("responsibilities" IS NOT NULL AND length(trim("responsibilities")) > 0)
    OR ("messagingNotes" IS NOT NULL AND length(trim("messagingNotes")) > 0)
  );
