-- Phase B: AI model rates + provider spend reconciliation for margin reporting.
ALTER TYPE "AdminAuditAction" ADD VALUE 'AI_MODEL_RATE_CHANGED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'PROVIDER_SPEND_RECONCILED';

CREATE TABLE "AiModelRate" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPer1MUsd" DECIMAL(12,6) NOT NULL,
    "outputPer1MUsd" DECIMAL(12,6) NOT NULL,
    "webSearchPerCallUsd" DECIMAL(12,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModelRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiModelRate_provider_model_effectiveFrom_key" ON "AiModelRate"("provider", "model", "effectiveFrom");
CREATE INDEX "AiModelRate_provider_model_effectiveFrom_idx" ON "AiModelRate"("provider", "model", "effectiveFrom");
CREATE INDEX "AiModelRate_effectiveFrom_idx" ON "AiModelRate"("effectiveFrom");

CREATE TABLE "ProviderSpendReconciliation" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "providerReportedUsd" DECIMAL(14,4) NOT NULL,
    "estimatedUsd" DECIMAL(14,4) NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderSpendReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderSpendReconciliation_provider_periodEnd_idx" ON "ProviderSpendReconciliation"("provider", "periodEnd");
CREATE INDEX "ProviderSpendReconciliation_createdAt_idx" ON "ProviderSpendReconciliation"("createdAt");
CREATE INDEX "ProviderSpendReconciliation_createdByUserId_idx" ON "ProviderSpendReconciliation"("createdByUserId");

ALTER TABLE "ProviderSpendReconciliation" ADD CONSTRAINT "ProviderSpendReconciliation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
