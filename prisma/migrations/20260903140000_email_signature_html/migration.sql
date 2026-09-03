-- Optional HTML signature for Connected Send (Graph). Plain body remains for deeplinks.

ALTER TABLE "EmailSignature" ADD COLUMN "htmlBody" TEXT;
