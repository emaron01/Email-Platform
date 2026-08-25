-- Campaign is a product+offer container; persona belongs to the contact.
-- Existing Campaign.personaId values remain as a generation fallback.

ALTER TABLE "Campaign"
  ALTER COLUMN "personaId" DROP NOT NULL;

CREATE TABLE "CampaignPersona" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignPersona_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignPersona_organizationId_campaignId_personaId_key"
  ON "CampaignPersona"("organizationId", "campaignId", "personaId");

CREATE INDEX "CampaignPersona_organizationId_idx" ON "CampaignPersona"("organizationId");
CREATE INDEX "CampaignPersona_campaignId_idx" ON "CampaignPersona"("campaignId");
CREATE INDEX "CampaignPersona_personaId_idx" ON "CampaignPersona"("personaId");

ALTER TABLE "CampaignPersona"
  ADD CONSTRAINT "CampaignPersona_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignPersona"
  ADD CONSTRAINT "CampaignPersona_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignPersona"
  ADD CONSTRAINT "CampaignPersona_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "Persona"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
