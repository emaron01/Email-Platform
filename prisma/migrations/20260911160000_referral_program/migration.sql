-- Referral program: lazy promo codes, reward ledger, idempotent redemptions.

CREATE TYPE "ReferralRedemptionStatus" AS ENUM ('ATTRIBUTED', 'COUNTED');

CREATE TABLE "OrganizationReferralCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stripePromotionCodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationReferralReward" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "successfulReferralCount" INTEGER NOT NULL DEFAULT 0,
    "rewardPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationReferralReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralRedemption" (
    "id" TEXT NOT NULL,
    "referrerOrganizationId" TEXT NOT NULL,
    "refereeOrganizationId" TEXT NOT NULL,
    "stripePromotionCodeId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "refereeEmailNormalized" TEXT NOT NULL,
    "referrerEmailNormalized" TEXT NOT NULL,
    "status" "ReferralRedemptionStatus" NOT NULL DEFAULT 'ATTRIBUTED',
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationReferralCode_organizationId_key" ON "OrganizationReferralCode"("organizationId");
CREATE UNIQUE INDEX "OrganizationReferralCode_code_key" ON "OrganizationReferralCode"("code");
CREATE UNIQUE INDEX "OrganizationReferralCode_stripePromotionCodeId_key" ON "OrganizationReferralCode"("stripePromotionCodeId");
CREATE INDEX "OrganizationReferralCode_stripePromotionCodeId_idx" ON "OrganizationReferralCode"("stripePromotionCodeId");

CREATE UNIQUE INDEX "OrganizationReferralReward_organizationId_key" ON "OrganizationReferralReward"("organizationId");

CREATE UNIQUE INDEX "ReferralRedemption_refereeOrganizationId_key" ON "ReferralRedemption"("refereeOrganizationId");
CREATE UNIQUE INDEX "ReferralRedemption_stripeSubscriptionId_key" ON "ReferralRedemption"("stripeSubscriptionId");
CREATE INDEX "ReferralRedemption_referrerOrganizationId_idx" ON "ReferralRedemption"("referrerOrganizationId");
CREATE INDEX "ReferralRedemption_stripePromotionCodeId_idx" ON "ReferralRedemption"("stripePromotionCodeId");
CREATE INDEX "ReferralRedemption_refereeEmailNormalized_idx" ON "ReferralRedemption"("refereeEmailNormalized");
CREATE INDEX "ReferralRedemption_status_idx" ON "ReferralRedemption"("status");

ALTER TABLE "OrganizationReferralCode" ADD CONSTRAINT "OrganizationReferralCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationReferralReward" ADD CONSTRAINT "OrganizationReferralReward_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralRedemption" ADD CONSTRAINT "ReferralRedemption_referrerOrganizationId_fkey" FOREIGN KEY ("referrerOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralRedemption" ADD CONSTRAINT "ReferralRedemption_refereeOrganizationId_fkey" FOREIGN KEY ("refereeOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
