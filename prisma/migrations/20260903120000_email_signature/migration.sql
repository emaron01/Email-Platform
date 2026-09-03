-- Per-user plain-text email signature. One row per user per organization.

CREATE TABLE "EmailSignature" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSignature_organizationId_userId_key" ON "EmailSignature"("organizationId", "userId");
CREATE INDEX "EmailSignature_organizationId_idx" ON "EmailSignature"("organizationId");
CREATE INDEX "EmailSignature_userId_idx" ON "EmailSignature"("userId");

ALTER TABLE "EmailSignature"
  ADD CONSTRAINT "EmailSignature_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailSignature"
  ADD CONSTRAINT "EmailSignature_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
