-- Additive soft-archive for Product / Persona / Icp (preserve ScoringRun FKs)

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Persona" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Product_organizationId_archivedAt_idx" ON "Product"("organizationId", "archivedAt");
CREATE INDEX IF NOT EXISTS "Persona_organizationId_archivedAt_idx" ON "Persona"("organizationId", "archivedAt");
CREATE INDEX IF NOT EXISTS "Icp_organizationId_archivedAt_idx" ON "Icp"("organizationId", "archivedAt");
