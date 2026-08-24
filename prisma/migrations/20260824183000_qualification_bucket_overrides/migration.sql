CREATE TYPE "QualificationBucket" AS ENUM (
  'GOOD',
  'NEEDS_REVIEW',
  'EXCLUDED'
);
CREATE TYPE "QualificationOverrideTarget" AS ENUM (
  'COMPANY',
  'CONTACT'
);

CREATE TABLE "QualificationBucketOverride" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "scoringRunId" TEXT NOT NULL,
  "targetType" "QualificationOverrideTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "bucket" "QualificationBucket" NOT NULL,
  "overriddenById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualificationBucketOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QualificationBucketOverride_org_run_target_key"
  ON "QualificationBucketOverride"(
    "organizationId",
    "scoringRunId",
    "targetType",
    "targetId"
  );
CREATE INDEX "QualificationBucketOverride_organizationId_idx"
  ON "QualificationBucketOverride"("organizationId");
CREATE INDEX "QualificationBucketOverride_scoringRunId_idx"
  ON "QualificationBucketOverride"("scoringRunId");
CREATE INDEX "QualificationBucketOverride_overriddenById_idx"
  ON "QualificationBucketOverride"("overriddenById");

ALTER TABLE "QualificationBucketOverride"
  ADD CONSTRAINT "QualificationBucketOverride_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualificationBucketOverride"
  ADD CONSTRAINT "QualificationBucketOverride_scoringRunId_fkey"
  FOREIGN KEY ("scoringRunId") REFERENCES "ScoringRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualificationBucketOverride"
  ADD CONSTRAINT "QualificationBucketOverride_overriddenById_fkey"
  FOREIGN KEY ("overriddenById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
