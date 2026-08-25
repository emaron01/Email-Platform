-- Distinct unmatched-title review: AI proposals on a scoring run, plus
-- product-level dismissals so the same title is not re-proposed.

CREATE TYPE "TitleSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');

ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'TITLE_SUGGESTION';

CREATE TABLE "TitleSuggestion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scoringRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unmatchedTitle" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "contactCount" INTEGER NOT NULL,
    "proposedPersonaId" TEXT,
    "proposedPersonaName" TEXT,
    "confidence" TEXT,
    "reasoning" TEXT,
    "status" "TitleSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedPersonaId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitleSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductTitleDismissal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "unmatchedTitle" TEXT NOT NULL,
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTitleDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TitleSuggestion_scoringRunId_normalizedTitle_key"
  ON "TitleSuggestion"("scoringRunId", "normalizedTitle");

CREATE INDEX "TitleSuggestion_organizationId_idx"
  ON "TitleSuggestion"("organizationId");

CREATE INDEX "TitleSuggestion_organizationId_scoringRunId_idx"
  ON "TitleSuggestion"("organizationId", "scoringRunId");

CREATE INDEX "TitleSuggestion_organizationId_productId_status_idx"
  ON "TitleSuggestion"("organizationId", "productId", "status");

CREATE INDEX "TitleSuggestion_productId_idx"
  ON "TitleSuggestion"("productId");

CREATE UNIQUE INDEX "ProductTitleDismissal_organizationId_productId_normalizedTitle_key"
  ON "ProductTitleDismissal"("organizationId", "productId", "normalizedTitle");

CREATE INDEX "ProductTitleDismissal_organizationId_idx"
  ON "ProductTitleDismissal"("organizationId");

CREATE INDEX "ProductTitleDismissal_productId_idx"
  ON "ProductTitleDismissal"("productId");

ALTER TABLE "TitleSuggestion"
  ADD CONSTRAINT "TitleSuggestion_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TitleSuggestion"
  ADD CONSTRAINT "TitleSuggestion_scoringRunId_fkey"
  FOREIGN KEY ("scoringRunId") REFERENCES "ScoringRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TitleSuggestion"
  ADD CONSTRAINT "TitleSuggestion_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TitleSuggestion"
  ADD CONSTRAINT "TitleSuggestion_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductTitleDismissal"
  ADD CONSTRAINT "ProductTitleDismissal_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductTitleDismissal"
  ADD CONSTRAINT "ProductTitleDismissal_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductTitleDismissal"
  ADD CONSTRAINT "ProductTitleDismissal_dismissedById_fkey"
  FOREIGN KEY ("dismissedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
