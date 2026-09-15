-- Company research credit packs: optional user attribution for Team/Enterprise.
-- Standard packs remain organization-scoped (userId NULL).

ALTER TYPE "AdminAuditAction" ADD VALUE 'COMPANY_RESEARCH_CREDIT_GRANTED';

ALTER TABLE "CompanyResearchCredit" ADD COLUMN "userId" TEXT;

ALTER TABLE "CompanyResearchCredit"
  ADD CONSTRAINT "CompanyResearchCredit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CompanyResearchCredit_organizationId_userId_idx"
  ON "CompanyResearchCredit"("organizationId", "userId");

CREATE INDEX "CompanyResearchCredit_userId_idx"
  ON "CompanyResearchCredit"("userId");
