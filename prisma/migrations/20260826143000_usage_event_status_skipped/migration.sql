-- Allow metering operations that did not spend (fresh reuse, not required, unconfigured).
ALTER TYPE "UsageEventStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
