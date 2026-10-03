-- Connected Microsoft 365 send stays off for every existing organization.
-- MailboxConnection rows are not changed.
ALTER TABLE "OrganizationBillingProfile"
  ADD COLUMN IF NOT EXISTS "microsoft365SendingEnabled" BOOLEAN NOT NULL DEFAULT false;
