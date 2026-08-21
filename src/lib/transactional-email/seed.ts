import type { TransactionalEmailTemplateKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BASELINE_TEMPLATES } from "@/lib/transactional-email/templates";

/** Seed editable + baseline templates (idempotent). */
export async function ensureTransactionalTemplatesSeeded(): Promise<void> {
  const keys = Object.keys(BASELINE_TEMPLATES) as TransactionalEmailTemplateKey[];
  for (const templateKey of keys) {
    const baseline = BASELINE_TEMPLATES[templateKey];
    await prisma.transactionalEmailTemplateBaseline.upsert({
      where: { templateKey },
      update: {},
      create: {
        templateKey,
        displayName: baseline.displayName,
        subjectTemplate: baseline.subjectTemplate,
        htmlTemplate: baseline.htmlTemplate,
        textTemplate: baseline.textTemplate,
      },
    });
    await prisma.transactionalEmailTemplate.upsert({
      where: { templateKey },
      update: {},
      create: {
        templateKey,
        displayName: baseline.displayName,
        subjectTemplate: baseline.subjectTemplate,
        htmlTemplate: baseline.htmlTemplate,
        textTemplate: baseline.textTemplate,
        enabled: true,
        version: 1,
      },
    });
  }
}
