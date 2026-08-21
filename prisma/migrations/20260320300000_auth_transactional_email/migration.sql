-- Phase 4: authentication identity tables, app user auth fields, billing profile,
-- platform roles, transactional email templates/events, rate limits, audit.

CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'SUPER_ADMIN', 'SUPPORT');

CREATE TYPE "AdminAuditAction" AS ENUM (
  'USER_SIGNUP',
  'EMAIL_VERIFIED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_COMPLETED',
  'ORGANIZATION_INVITATION_CREATED',
  'ORGANIZATION_INVITATION_ACCEPTED',
  'ORGANIZATION_MEMBER_ROLE_CHANGED',
  'BILLING_CONTACT_CHANGED',
  'TRANSACTIONAL_TEMPLATE_CHANGED',
  'PLATFORM_ROLE_CHANGED',
  'WORKSPACE_RENAMED',
  'LOGIN_SUCCEEDED',
  'LOGOUT'
);

CREATE TYPE "TransactionalEmailTemplateKey" AS ENUM (
  'EMAIL_VERIFICATION',
  'WELCOME',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'ORGANIZATION_INVITATION',
  'INVITATION_ACCEPTED'
);

CREATE TYPE "TransactionalEmailStatus" AS ENUM (
  'QUEUED',
  'SENT',
  'FAILED',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED'
);

-- User auth/profile columns (additive + safe backfill)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeOrganizationId" TEXT;

UPDATE "User"
SET "emailNormalized" = lower(trim("email"))
WHERE "emailNormalized" IS NULL;

-- Split existing display names into first/last when possible
UPDATE "User"
SET
  "firstName" = COALESCE("firstName", split_part(COALESCE("name", ''), ' ', 1)),
  "lastName" = COALESCE(
    "lastName",
    NULLIF(trim(substring(COALESCE("name", '') from length(split_part(COALESCE("name", ''), ' ', 1)) + 1)), '')
  )
WHERE "firstName" IS NULL OR "lastName" IS NULL;

ALTER TABLE "User" ALTER COLUMN "emailNormalized" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_authUserId_key" ON "User"("authUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_emailNormalized_key" ON "User"("emailNormalized");
CREATE INDEX IF NOT EXISTS "User_platformRole_idx" ON "User"("platformRole");
CREATE INDEX IF NOT EXISTS "User_activeOrganizationId_idx" ON "User"("activeOrganizationId");

ALTER TABLE "User"
  DROP CONSTRAINT IF EXISTS "User_activeOrganizationId_fkey";
ALTER TABLE "User"
  ADD CONSTRAINT "User_activeOrganizationId_fkey"
  FOREIGN KEY ("activeOrganizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationMembership"
  ADD COLUMN IF NOT EXISTS "isBillingContact" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "OrganizationBillingProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "billingEmail" TEXT,
  "companyLegalName" TEXT,
  "taxId" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "region" TEXT,
  "postalCode" TEXT,
  "countryCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationBillingProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationBillingProfile_organizationId_key"
  ON "OrganizationBillingProfile"("organizationId");

ALTER TABLE "OrganizationBillingProfile"
  DROP CONSTRAINT IF EXISTS "OrganizationBillingProfile_organizationId_fkey";
ALTER TABLE "OrganizationBillingProfile"
  ADD CONSTRAINT "OrganizationBillingProfile_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill billing profiles for existing orgs
INSERT INTO "OrganizationBillingProfile" ("id", "organizationId", "billingEmail", "createdAt", "updatedAt")
SELECT 'obp_' || o."id", o."id", NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrganizationBillingProfile" b WHERE b."organizationId" = o."id"
);

-- Better Auth tables
CREATE TABLE IF NOT EXISTS "auth_user" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "firstName" TEXT NOT NULL DEFAULT '',
  "lastName" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "auth_user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_user_email_key" ON "auth_user"("email");

CREATE TABLE IF NOT EXISTS "auth_session" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_session_token_key" ON "auth_session"("token");
CREATE INDEX IF NOT EXISTS "auth_session_userId_idx" ON "auth_session"("userId");
ALTER TABLE "auth_session" DROP CONSTRAINT IF EXISTS "auth_session_userId_fkey";
ALTER TABLE "auth_session"
  ADD CONSTRAINT "auth_session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "auth_account" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "auth_account_userId_idx" ON "auth_account"("userId");
ALTER TABLE "auth_account" DROP CONSTRAINT IF EXISTS "auth_account_userId_fkey";
ALTER TABLE "auth_account"
  ADD CONSTRAINT "auth_account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "auth_verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "auth_verification_identifier_idx" ON "auth_verification"("identifier");

CREATE TABLE IF NOT EXISTS "AdminAuditEvent" (
  "id" TEXT NOT NULL,
  "action" "AdminAuditAction" NOT NULL,
  "actorUserId" TEXT,
  "organizationId" TEXT,
  "targetUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdminAuditEvent_action_idx" ON "AdminAuditEvent"("action");
CREATE INDEX IF NOT EXISTS "AdminAuditEvent_actorUserId_idx" ON "AdminAuditEvent"("actorUserId");
CREATE INDEX IF NOT EXISTS "AdminAuditEvent_organizationId_idx" ON "AdminAuditEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "AdminAuditEvent_createdAt_idx" ON "AdminAuditEvent"("createdAt");
ALTER TABLE "AdminAuditEvent" DROP CONSTRAINT IF EXISTS "AdminAuditEvent_actorUserId_fkey";
ALTER TABLE "AdminAuditEvent"
  ADD CONSTRAINT "AdminAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "TransactionalEmailTemplate" (
  "id" TEXT NOT NULL,
  "templateKey" "TransactionalEmailTemplateKey" NOT NULL,
  "displayName" TEXT NOT NULL,
  "subjectTemplate" TEXT NOT NULL,
  "htmlTemplate" TEXT NOT NULL,
  "textTemplate" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransactionalEmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionalEmailTemplate_templateKey_key"
  ON "TransactionalEmailTemplate"("templateKey");

CREATE TABLE IF NOT EXISTS "TransactionalEmailTemplateBaseline" (
  "id" TEXT NOT NULL,
  "templateKey" "TransactionalEmailTemplateKey" NOT NULL,
  "displayName" TEXT NOT NULL,
  "subjectTemplate" TEXT NOT NULL,
  "htmlTemplate" TEXT NOT NULL,
  "textTemplate" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionalEmailTemplateBaseline_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionalEmailTemplateBaseline_templateKey_key"
  ON "TransactionalEmailTemplateBaseline"("templateKey");

CREATE TABLE IF NOT EXISTS "TransactionalEmailEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "organizationId" TEXT,
  "templateKey" "TransactionalEmailTemplateKey" NOT NULL,
  "templateVersion" INTEGER,
  "recipientEmailNormalized" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "status" "TransactionalEmailStatus" NOT NULL,
  "failureCategory" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "TransactionalEmailEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionalEmailEvent_idempotencyKey_key"
  ON "TransactionalEmailEvent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "TransactionalEmailEvent_templateKey_idx" ON "TransactionalEmailEvent"("templateKey");
CREATE INDEX IF NOT EXISTS "TransactionalEmailEvent_recipientEmailNormalized_idx" ON "TransactionalEmailEvent"("recipientEmailNormalized");
CREATE INDEX IF NOT EXISTS "TransactionalEmailEvent_organizationId_idx" ON "TransactionalEmailEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "TransactionalEmailEvent_userId_idx" ON "TransactionalEmailEvent"("userId");
CREATE INDEX IF NOT EXISTS "TransactionalEmailEvent_createdAt_idx" ON "TransactionalEmailEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "TransactionalEmailEvent_status_idx" ON "TransactionalEmailEvent"("status");
ALTER TABLE "TransactionalEmailEvent" DROP CONSTRAINT IF EXISTS "TransactionalEmailEvent_userId_fkey";
ALTER TABLE "TransactionalEmailEvent"
  ADD CONSTRAINT "TransactionalEmailEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransactionalEmailEvent" DROP CONSTRAINT IF EXISTS "TransactionalEmailEvent_organizationId_fkey";
ALTER TABLE "TransactionalEmailEvent"
  ADD CONSTRAINT "TransactionalEmailEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "bucketKey" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitBucket_bucketKey_windowStart_key"
  ON "RateLimitBucket"("bucketKey", "windowStart");
CREATE INDEX IF NOT EXISTS "RateLimitBucket_bucketKey_idx" ON "RateLimitBucket"("bucketKey");

-- Set active organization for users with a single membership
UPDATE "User" u
SET "activeOrganizationId" = m."organizationId"
FROM (
  SELECT "userId", MIN("organizationId") AS "organizationId"
  FROM "OrganizationMembership"
  GROUP BY "userId"
  HAVING COUNT(*) = 1
) m
WHERE u."id" = m."userId" AND u."activeOrganizationId" IS NULL;
