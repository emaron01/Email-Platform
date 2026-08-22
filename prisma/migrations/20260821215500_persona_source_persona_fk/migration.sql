-- PersonaSource.personaId → real FK (Cascade). Ordered delete helpers rely on this.
-- Timestamp: 2026-08-21 (sorts after 20260321180000_staged_product_persona).

-- Clear dangling personaId values before adding the FK.
UPDATE "PersonaSource" AS ps
SET "personaId" = NULL
WHERE "personaId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Persona" p WHERE p.id = ps."personaId");

ALTER TABLE "PersonaSource"
  ADD CONSTRAINT "PersonaSource_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PersonaSource_personaId_idx" ON "PersonaSource"("personaId");
