CREATE TYPE "MailboxProvider" AS ENUM ('MICROSOFT_365');
CREATE TYPE "MailboxConnectionStatus" AS ENUM (
  'CONNECTED',
  'RECONNECT_REQUIRED'
);
ALTER TYPE "EmailDraftStatus" ADD VALUE IF NOT EXISTS 'SENDING';

ALTER TABLE "EmailDraft"
  ADD COLUMN "sendAttemptId" TEXT,
  ADD COLUMN "sendAttemptStartedAt" TIMESTAMP(3);

CREATE TABLE "MailboxConnection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "MailboxProvider" NOT NULL,
  "status" "MailboxConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "mailboxAddress" TEXT NOT NULL,
  "providerTenantId" TEXT,
  "providerAccountId" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "grantedScopesJson" JSONB NOT NULL,
  "lastErrorCode" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refreshedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailboxOAuthState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "MailboxProvider" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "encryptedCodeVerifier" TEXT NOT NULL,
  "returnPath" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailboxOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailboxConnection_organizationId_userId_provider_key"
  ON "MailboxConnection"("organizationId", "userId", "provider");
CREATE INDEX "MailboxConnection_organizationId_idx"
  ON "MailboxConnection"("organizationId");
CREATE INDEX "MailboxConnection_userId_idx"
  ON "MailboxConnection"("userId");
CREATE INDEX "MailboxConnection_organizationId_status_idx"
  ON "MailboxConnection"("organizationId", "status");

CREATE UNIQUE INDEX "MailboxOAuthState_stateHash_key"
  ON "MailboxOAuthState"("stateHash");
CREATE INDEX "MailboxOAuthState_organizationId_userId_idx"
  ON "MailboxOAuthState"("organizationId", "userId");
CREATE INDEX "MailboxOAuthState_expiresAt_idx"
  ON "MailboxOAuthState"("expiresAt");

ALTER TABLE "MailboxConnection"
  ADD CONSTRAINT "MailboxConnection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailboxConnection"
  ADD CONSTRAINT "MailboxConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailboxOAuthState"
  ADD CONSTRAINT "MailboxOAuthState_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailboxOAuthState"
  ADD CONSTRAINT "MailboxOAuthState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
