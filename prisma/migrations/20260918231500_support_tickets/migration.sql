ALTER TYPE "AdminAuditAction" ADD VALUE 'SUPPORT_TICKET_STATUS_CHANGED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'SUPPORT_TICKET_NOTE_ADDED';
ALTER TYPE "TransactionalEmailTemplateKey" ADD VALUE 'SUPPORT_TICKET_CREATED';

CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "submittedByUserId" TEXT,
    "subject" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "sourcePath" VARCHAR(500) NOT NULL,
    "userAgent" VARCHAR(1000),
    "organizationName" VARCHAR(200) NOT NULL,
    "submittedByName" VARCHAR(200),
    "submittedByEmail" VARCHAR(320) NOT NULL,
    "planCode" VARCHAR(50),
    "billingStatus" "BillingStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketNote" (
    "id" TEXT NOT NULL,
    "supportTicketId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");
CREATE INDEX "SupportTicket_organizationId_idx" ON "SupportTicket"("organizationId");
CREATE INDEX "SupportTicket_submittedByUserId_idx" ON "SupportTicket"("submittedByUserId");
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");
CREATE INDEX "SupportTicketNote_supportTicketId_createdAt_idx" ON "SupportTicketNote"("supportTicketId", "createdAt");
CREATE INDEX "SupportTicketNote_authorUserId_idx" ON "SupportTicketNote"("authorUserId");

ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_submittedByUserId_fkey"
FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicketNote"
ADD CONSTRAINT "SupportTicketNote_supportTicketId_fkey"
FOREIGN KEY ("supportTicketId") REFERENCES "SupportTicket"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportTicketNote"
ADD CONSTRAINT "SupportTicketNote_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
