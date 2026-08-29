/**
 * One-off eval for motion-specific drafts.
 * npx dotenv -e .env.local -e .env -- tsx scripts/eval-motion-specifics-drafts.ts
 */
import Module from "node:module";

type ModuleLoad = (
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
) => unknown;
const patchedModule = Module as typeof Module & { _load: ModuleLoad };
const moduleLoad = patchedModule._load.bind(patchedModule);
patchedModule._load = function load(
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
): unknown {
  if (request === "server-only") return {};
  return moduleLoad(request, parent, isMain);
};

const TARGETS = [
  { company: "StoneEagle", firstName: "Brent" },
  { company: "Substation Engineering", firstName: "Taylor" },
  { company: "SoftWriters", firstName: "Jeff" },
];

async function main() {
  if (!process.env.EMAIL_AI_PROVIDER && process.env.RESEARCH_AI_PROVIDER) {
    process.env.EMAIL_AI_PROVIDER = process.env.RESEARCH_AI_PROVIDER;
    process.env.EMAIL_AI_API_KEY =
      process.env.EMAIL_AI_API_KEY || process.env.RESEARCH_AI_API_KEY;
    process.env.EMAIL_AI_MODEL_URL =
      process.env.EMAIL_AI_MODEL_URL || process.env.RESEARCH_AI_MODEL_URL;
  }
  if (!process.env.EMAIL_FACTS_AI_PROVIDER && process.env.EMAIL_AI_PROVIDER) {
    process.env.EMAIL_FACTS_AI_PROVIDER = process.env.EMAIL_AI_PROVIDER;
    process.env.EMAIL_FACTS_AI_API_KEY =
      process.env.EMAIL_FACTS_AI_API_KEY || process.env.EMAIL_AI_API_KEY;
    process.env.EMAIL_FACTS_AI_MODEL_URL =
      process.env.EMAIL_FACTS_AI_MODEL_URL || process.env.EMAIL_AI_MODEL_URL;
  }
  if (!process.env.EMAIL_AI_MODEL?.trim()) {
    throw new Error(
      "EMAIL_AI_MODEL is required. Set EMAIL_AI_MODEL in .env.local before running this script.",
    );
  }
  if (!process.env.EMAIL_FACTS_AI_MODEL?.trim()) {
    process.env.EMAIL_FACTS_AI_MODEL = process.env.EMAIL_AI_MODEL;
  }

  const { PrismaClient } = await import("@prisma/client");
  const { loadEmailGenerationContext } = await import(
    "../src/lib/email-generation/context"
  );
  const { prepareEmailGenerationMessages } = await import(
    "../src/lib/email-generation/prepare-email-generation"
  );
  const { generateEmailDraft } = await import(
    "../src/lib/email-generation/service"
  );
  const { estimateFactSelectionCostUsd } = await import(
    "../src/lib/email-generation/semantic-fact-selector"
  );

  const prisma = new PrismaClient();
  try {
    for (const target of TARGETS) {
      const contact = await prisma.contact.findFirst({
        where: {
          company: { contains: target.company, mode: "insensitive" },
          firstName: { equals: target.firstName, mode: "insensitive" },
        },
        include: {
          campaignContacts: {
            where: { status: { not: "EXCLUDED" } },
            orderBy: { updatedAt: "desc" },
            take: 1,
            include: {
              campaign: { select: { archivedAt: true } },
            },
          },
        },
      });
      if (!contact?.campaignContacts[0] || contact.campaignContacts[0].campaign.archivedAt) {
        console.log(`SKIP ${target.firstName} @ ${target.company}`);
        continue;
      }
      const membership = await prisma.organizationMembership.findFirst({
        where: { organizationId: contact.organizationId },
        select: { userId: true },
      });
      if (!membership) continue;

      const cc = contact.campaignContacts[0];
      const context = await loadEmailGenerationContext(cc.id, membership.userId);
      const prepared = await prepareEmailGenerationMessages(context);
      console.log("\n==========");
      console.log(
        `${context.contact.firstName} ${context.contact.lastName} — ${context.contact.title} @ ${context.contact.company}`,
      );
      console.log(`Fact selection cache key: ${prepared.factSelection.cacheKey ?? "n/a"}`);
      if (prepared.factSelection.usage) {
        console.log(
          `Fact selection cost (est. USD): ${estimateFactSelectionCostUsd(prepared.factSelection.usage).toFixed(6)}`,
        );
      }
      console.log("Selected specifics:");
      for (const item of prepared.requiredMotionSpecifics) {
        console.log(`  - [${item.sourceField}] ${item.text}`);
        console.log(`    why: ${item.whyItMatters}`);
      }
      if (prepared.requiredMotionSpecifics.length === 0) {
        console.log("  (none — THIN personalization)");
      }
      const draft = await generateEmailDraft(context, prepared.messages, {
        sequenceNumber: 1,
        kind: "INITIAL",
        requiredMotionSpecifics: prepared.requiredMotionSpecifics,
        personalization: prepared.personalization,
        factSelectionUsage: prepared.factSelection.usage,
        factSelectionCacheKey: prepared.factSelection.cacheKey,
      });
      console.log(`Subject: ${draft.subject}`);
      console.log("Body:");
      console.log(draft.body);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
