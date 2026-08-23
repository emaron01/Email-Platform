-- User-scoped voice samples for outbound email voice capture.

CREATE TYPE "VoiceSampleProvenance" AS ENUM ('PASTED', 'IMPORTED');

ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'VOICE_SAMPLE_SAVED';

CREATE TABLE "VoiceSample" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sampleText" TEXT NOT NULL,
  "provenance" "VoiceSampleProvenance" NOT NULL DEFAULT 'PASTED',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VoiceSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceSample_organizationId_idx" ON "VoiceSample"("organizationId");
CREATE INDEX "VoiceSample_userId_idx" ON "VoiceSample"("userId");
CREATE INDEX "VoiceSample_organizationId_userId_idx" ON "VoiceSample"("organizationId", "userId");
CREATE INDEX "VoiceSample_organizationId_userId_createdAt_idx" ON "VoiceSample"("organizationId", "userId", "createdAt");

ALTER TABLE "VoiceSample"
  ADD CONSTRAINT "VoiceSample_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceSample"
  ADD CONSTRAINT "VoiceSample_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
