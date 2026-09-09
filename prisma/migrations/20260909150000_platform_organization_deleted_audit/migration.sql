-- Additive: audit action for platform hard-delete of an organization.
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_ORGANIZATION_DELETED';
