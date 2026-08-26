/**
 * Re-score a production run and report deterministic qualification metrics.
 *
 * Usage:
 *   npx dotenv -e .env.local -e .env -- tsx scripts/measure-deterministic-scoring.ts --run-id <id>
 *   npx dotenv -e .env.local -e .env -- tsx scripts/measure-deterministic-scoring.ts --run-id <id> --rescore
 */
import Module from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  if (request === "server-only") {
    return {};
  }
  return moduleLoad(request, parent, isMain);
};

import { PrismaClient } from "@prisma/client";
import { scoreLabelToBucket } from "../src/lib/workflow/qualification";

const DEFAULT_RUN_ID = "cmtadmg9e00h6ls2vjls8vg3s";
const OUT_DIR = join(process.cwd(), "tmp", "research-measure");

type BucketCounts = Record<string, number>;

function parseArgs(argv: string[]) {
  let runId = DEFAULT_RUN_ID;
  let rescore = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run-id") {
      runId = argv[index + 1] ?? runId;
      index += 1;
    } else if (arg === "--rescore") {
      rescore = true;
    }
  }
  return { runId, rescore };
}

function bucketCounts(rows: Array<{ bucket: string }>): BucketCounts {
  const counts: BucketCounts = {
    GOOD: 0,
    NEEDS_REVIEW: 0,
    EXCLUDED: 0,
    POOR_FIT: 0,
  };
  for (const row of rows) {
    counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
  }
  return counts;
}

async function collectBeforeMetrics(
  prisma: PrismaClient,
  runId: string,
  contactScoreIds: string[],
) {
  const usage = await prisma.usageEvent.findMany({
    where: {
      scoringRunId: runId,
      operation: "CONTACT_SCORING",
      contactId: { not: null },
    },
    select: {
      contactId: true,
      inputTokens: true,
      outputTokens: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const contactResearch = await prisma.usageEvent.findMany({
    where: {
      scoringRunId: runId,
      operation: "CONTACT_RESEARCH_SYNTHESIS",
    },
    select: {
      contactId: true,
      inputTokens: true,
      outputTokens: true,
      createdAt: true,
    },
  });

  const latestScoringByContact = new Map<string, (typeof usage)[number]>();
  for (const row of usage) {
    if (!row.contactId) continue;
    if (!latestScoringByContact.has(row.contactId)) {
      latestScoringByContact.set(row.contactId, row);
    }
  }

  let aiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const row of latestScoringByContact.values()) {
    const metadata = row.metadata as { aiCalls?: number; aiSkipped?: boolean } | null;
    if (metadata?.aiSkipped) continue;
    aiCalls += metadata?.aiCalls ?? 1;
    inputTokens += row.inputTokens ?? 0;
    outputTokens += row.outputTokens ?? 0;
  }

  const scores = await prisma.contactScore.findMany({
    where: { id: { in: contactScoreIds } },
    select: {
      id: true,
      contactId: true,
      scoreLabel: true,
      assessmentData: true,
      matchedPersonaId: true,
    },
  });
  const buckets = scores.map((row) => ({
    contactId: row.contactId,
    bucket: scoreLabelToBucket(row.scoreLabel, row.assessmentData),
    matchedPersonaId: row.matchedPersonaId,
  }));

  return {
    contacts: scores.length,
    bucketCounts: bucketCounts(buckets),
    aiCalls,
    inputTokens,
    outputTokens,
    contactResearchCalls: contactResearch.length,
    contactResearchInputTokens: contactResearch.reduce(
      (sum, row) => sum + (row.inputTokens ?? 0),
      0,
    ),
    contactResearchOutputTokens: contactResearch.reduce(
      (sum, row) => sum + (row.outputTokens ?? 0),
      0,
    ),
    rows: buckets,
  };
}

async function main() {
  const { runId, rescore } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  mkdirSync(OUT_DIR, { recursive: true });

  try {
    const run = await prisma.scoringRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        organizationId: true,
        totalContacts: true,
        productSnapshot: true,
        icpSnapshot: true,
        personaSnapshot: true,
        personaSnapshots: true,
      },
    });
    if (!run) {
      throw new Error(`Scoring run not found: ${runId}`);
    }

    const scoreRows = await prisma.contactScore.findMany({
      where: {
        scoringRunId: runId,
        scoringStatus: { notIn: ["SUPPRESSED", "UNUSABLE"] },
      },
      select: { id: true, contactId: true },
      orderBy: { createdAt: "asc" },
    });

    const before = await collectBeforeMetrics(
      prisma,
      runId,
      scoreRows.map((row) => row.id),
    );

    if (rescore) {
      const { resolvePersonaSnapshots } = await import(
        "../src/lib/scoring/title-fit"
      );
      const { scoreSingleContact } = await import(
        "../src/lib/scoring/score-contact"
      );
      const personas = resolvePersonaSnapshots({
        personaSnapshot: run.personaSnapshot,
        personaSnapshots: run.personaSnapshots,
      });
      const persona = personas[0];
      if (!persona) throw new Error("Run is missing persona snapshots.");

      for (const row of scoreRows) {
        await scoreSingleContact({
          organizationId: run.organizationId,
          scoringRunId: run.id,
          contactScoreId: row.id,
          product: run.productSnapshot as never,
          icp: run.icpSnapshot as never,
          persona,
          personas,
        });
      }
    }

    const after = await collectBeforeMetrics(
      prisma,
      runId,
      scoreRows.map((row) => row.id),
    );

    const report = {
      capturedAt: new Date().toISOString(),
      runId,
      rescored: rescore,
      contacts: scoreRows.length,
      before,
      after,
      delta: {
        aiCalls: after.aiCalls - before.aiCalls,
        inputTokens: after.inputTokens - before.inputTokens,
        outputTokens: after.outputTokens - before.outputTokens,
        contactResearchCalls:
          after.contactResearchCalls - before.contactResearchCalls,
      },
    };

    const outPath = join(OUT_DIR, "scoring-deterministic-measure.json");
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`Wrote ${outPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
