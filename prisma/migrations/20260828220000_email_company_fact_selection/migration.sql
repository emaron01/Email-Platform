-- Additive: track semantic company-fact selection for email generation.
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'EMAIL_COMPANY_FACT_SELECTION';
