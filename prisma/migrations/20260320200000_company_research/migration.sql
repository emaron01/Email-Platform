-- Phase 3B: Company + CompanyResearch (tenant-scoped)
-- Additive only. Does not reset DB or delete Contacts/Lists/ScoringRuns.

CREATE TYPE "CompanyResearchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');
CREATE TYPE "ResearchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "ResearchMethod" AS ENUM ('AUTOMATED', 'MANUAL', 'HYBRID');

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "normalizedDomain" TEXT,
    "industry" TEXT,
    "employeeCount" INTEGER,
    "revenue" DECIMAL(14,2),
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Company_organizationId_idx" ON "Company"("organizationId");
CREATE INDEX "Company_organizationId_normalizedName_idx" ON "Company"("organizationId", "normalizedName");
CREATE INDEX "Company_organizationId_normalizedDomain_idx" ON "Company"("organizationId", "normalizedDomain");
CREATE UNIQUE INDEX "Company_organizationId_normalizedDomain_key" ON "Company"("organizationId", "normalizedDomain");

ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompanyResearch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "CompanyResearchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "researchMethod" "ResearchMethod" NOT NULL DEFAULT 'AUTOMATED',
    "companySummary" TEXT,
    "whatTheySell" TEXT,
    "customerTypes" JSONB,
    "primaryMarkets" JSONB,
    "businessModel" TEXT,
    "estimatedAov" TEXT,
    "aovReasoning" TEXT,
    "companySizeContext" TEXT,
    "relevantTechnologies" JSONB,
    "buyingSignals" JSONB,
    "riskSignals" JSONB,
    "researchConfidence" "ResearchConfidence",
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "researchSources" JSONB,
    "researchedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyResearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyResearch_organizationId_idx" ON "CompanyResearch"("organizationId");
CREATE INDEX "CompanyResearch_organizationId_companyId_idx" ON "CompanyResearch"("organizationId", "companyId");
CREATE INDEX "CompanyResearch_companyId_idx" ON "CompanyResearch"("companyId");
CREATE INDEX "CompanyResearch_organizationId_status_idx" ON "CompanyResearch"("organizationId", "status");
CREATE INDEX "CompanyResearch_expiresAt_idx" ON "CompanyResearch"("expiresAt");

ALTER TABLE "CompanyResearch" ADD CONSTRAINT "CompanyResearch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyResearch" ADD CONSTRAINT "CompanyResearch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contact" ADD COLUMN "companyId" TEXT;
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");
CREATE INDEX "Contact_organizationId_companyId_idx" ON "Contact"("organizationId", "companyId");
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
