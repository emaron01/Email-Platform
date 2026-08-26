-- Unique person identity within an organization when email is present.
-- Run collapse preview/apply first if duplicate groups exist
-- (npm run db:contact-collapse-preview).

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_organizationId_normalizedEmail_key"
ON "Contact"("organizationId", "normalizedEmail");
