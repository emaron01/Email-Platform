-- Immutable first introducer of a company into the org research pool.
-- Existing rows stay NULL (legacy org-pool; no per-user net-new attribution).

ALTER TABLE "CompanyResearch" ADD COLUMN "firstResearchedByUserId" TEXT;

ALTER TABLE "CompanyResearch"
  ADD CONSTRAINT "CompanyResearch_firstResearchedByUserId_fkey"
  FOREIGN KEY ("firstResearchedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CompanyResearch_firstResearchedByUserId_idx"
  ON "CompanyResearch"("firstResearchedByUserId");

CREATE INDEX "CompanyResearch_organizationId_firstResearchedByUserId_idx"
  ON "CompanyResearch"("organizationId", "firstResearchedByUserId");
