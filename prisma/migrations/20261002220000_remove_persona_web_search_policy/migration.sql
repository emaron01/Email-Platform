-- Persona synthesis no longer searches the web. Drop the unused per-persona
-- search limits. Existing PersonaSource rows are left in place.
ALTER TABLE "ResearchPolicy" DROP COLUMN IF EXISTS "maxSearchQueriesPerPersona";
ALTER TABLE "ResearchPolicy" DROP COLUMN IF EXISTS "maxSourcesPerPersona";
ALTER TABLE "ResearchPolicy" DROP COLUMN IF EXISTS "personaResearchFreshnessDays";
