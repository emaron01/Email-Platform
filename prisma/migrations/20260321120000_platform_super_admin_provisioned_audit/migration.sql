-- Additive: audit action for production platform SUPER_ADMIN provisioning.
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_SUPER_ADMIN_PROVISIONED';
