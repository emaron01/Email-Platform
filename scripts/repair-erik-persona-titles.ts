/**
 * One-time repair for two Erik's Workspace personas whose target titles were
 * split on commas and picked up a bare "VP".
 *
 * Preview prints the before and after and writes nothing.
 * Apply writes the setup-run draft titles plus approved suggestion titles
 * that still name a function. Bare seniority tokens and cut-off fragments
 * are left out. It does not clear manuallyEditedFields, so a later
 * re-synthesis still leaves these titles alone.
 *
 * Apply refuses a Render host unless PERSONA_TITLE_REPAIR_ALLOW_PROD=1.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import {
  ERIK_PERSONA_TITLE_REPAIR_NAMES,
  ERIK_WORKSPACE_NAME,
  planPersonaTitleRepair,
  type PersonaTitleRepairPlan,
} from "../src/lib/persona/repair-target-titles";

function usage(): never {
  console.error(
    "Usage: tsx scripts/repair-erik-persona-titles.ts --preview|--apply",
  );
  process.exit(1);
}

function assertSafeUrl(url: string, applying: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const host = parsed.hostname.toLowerCase();
  const isRender = host.includes("render.com");
  if (
    isRender &&
    applying &&
    process.env.PERSONA_TITLE_REPAIR_ALLOW_PROD !== "1"
  ) {
    throw new Error(
      "Refusing to repair persona titles on a Render host. Set PERSONA_TITLE_REPAIR_ALLOW_PROD=1 after reviewing the preview.",
    );
  }
  console.log("Database (credentials redacted):");
  console.log(`  Host:     ${parsed.hostname}`);
  console.log(`  Port:     ${parsed.port || "(default)"}`);
  console.log(
    `  Database: ${decodeURIComponent(parsed.pathname.replace(/^\//, "") || "(unknown)")}`,
  );
}

async function loadPlans(prisma: PrismaClient): Promise<PersonaTitleRepairPlan[]> {
  const organization = await prisma.organization.findFirst({
    where: { name: ERIK_WORKSPACE_NAME },
    select: { id: true, name: true },
  });
  if (!organization) {
    throw new Error(`Organization "${ERIK_WORKSPACE_NAME}" was not found.`);
  }

  const personas = await prisma.persona.findMany({
    where: {
      organizationId: organization.id,
      archivedAt: null,
      name: { in: [...ERIK_PERSONA_TITLE_REPAIR_NAMES] },
    },
    select: {
      id: true,
      name: true,
      targetTitles: true,
      approvedPersonaSetupRunId: true,
    },
  });

  const plans: PersonaTitleRepairPlan[] = [];
  for (const expectedName of ERIK_PERSONA_TITLE_REPAIR_NAMES) {
    const matches = personas.filter((persona) => persona.name === expectedName);
    if (matches.length !== 1) {
      throw new Error(
        `Expected one active "${expectedName}" persona in ${organization.name}, found ${matches.length}.`,
      );
    }
    const persona = matches[0]!;
    if (!persona.approvedPersonaSetupRunId) {
      throw new Error(
        `"${persona.name}" has no approved persona setup run, so its draft titles cannot be copied.`,
      );
    }
    const run = await prisma.personaSetupRun.findFirst({
      where: {
        id: persona.approvedPersonaSetupRunId,
        organizationId: organization.id,
      },
      select: { id: true, personaDraftJson: true },
    });
    if (!run) {
      throw new Error(
        `Approved setup run ${persona.approvedPersonaSetupRunId} for "${persona.name}" was not found.`,
      );
    }
    const suggestions = await prisma.titleSuggestion.findMany({
      where: {
        organizationId: organization.id,
        status: "APPROVED",
        resolvedPersonaId: persona.id,
      },
      select: { unmatchedTitle: true },
      orderBy: { resolvedAt: "asc" },
    });
    plans.push(
      planPersonaTitleRepair({
        personaId: persona.id,
        personaName: persona.name,
        currentTitles: persona.targetTitles,
        draft: run.personaDraftJson,
        approvedSuggestionTitles: suggestions.map((row) => row.unmatchedTitle),
      }),
    );
  }
  return plans;
}

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const apply = args.includes("--apply");
  if (preview === apply) usage();

  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required.");
  assertSafeUrl(url, apply);

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const plans = await loadPlans(prisma);
    console.log(JSON.stringify({ mode: preview ? "preview" : "apply", plans }, null, 2));

    if (preview) {
      console.log("Preview only. No persona titles were written.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const plan of plans) {
        await tx.persona.update({
          where: { id: plan.personaId },
          data: {
            targetTitles: plan.after as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });
    console.log(`Wrote target titles for ${plans.length} personas.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Persona title repair failed.";
  console.error(message);
  process.exit(1);
});
