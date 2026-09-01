-- Rep-confirmed persona per campaign contact (explicit decision, not silent fallback).

ALTER TABLE "CampaignContact" ADD COLUMN "chosenPersonaId" TEXT;

CREATE INDEX "CampaignContact_chosenPersonaId_idx" ON "CampaignContact"("chosenPersonaId");

ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_chosenPersonaId_fkey" FOREIGN KEY ("chosenPersonaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
