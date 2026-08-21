-- Better Auth 1.7 account identity: required issuer + unique (issuer, accountId).
-- Additive only — does not drop auth tables or tenant data.

-- 1) Add nullable issuer for backfill
ALTER TABLE "auth_account" ADD COLUMN IF NOT EXISTS "issuer" TEXT;

-- 2) Backfill existing rows per Better Auth 1.7 upgrade guide.
-- Credential accounts use synthetic issuer local:credential.
-- Other providers without a known OIDC issuer use local:oauth:<providerId>
-- (provider IDs in this app are simple identifiers; encodeURIComponent-equivalent
-- for unreserved characters is identity).
UPDATE "auth_account"
SET "issuer" = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  WHEN "providerId" = 'siwe' THEN 'local:siwe'
  ELSE 'local:oauth:' || "providerId"
END
WHERE "issuer" IS NULL OR "issuer" = '';

-- 3) Fail closed if any row still lacks issuer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "auth_account" WHERE "issuer" IS NULL OR "issuer" = ''
  ) THEN
    RAISE EXCEPTION 'auth_account.issuer backfill left null/empty rows; refusing to proceed';
  END IF;
END $$;

-- 4) Enforce NOT NULL
ALTER TABLE "auth_account" ALTER COLUMN "issuer" SET NOT NULL;

-- 5) Compound unique identity key expected by Better Auth 1.7
CREATE UNIQUE INDEX IF NOT EXISTS "auth_account_issuer_accountId_key"
  ON "auth_account"("issuer", "accountId");
