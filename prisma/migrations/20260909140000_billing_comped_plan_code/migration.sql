-- Rename durable free grants to COMPED (self-serve no longer uses FREE).
UPDATE "OrganizationBillingProfile"
SET "planCode" = 'COMPED'
WHERE "planCode" = 'FREE';
