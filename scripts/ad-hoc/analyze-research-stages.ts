/**
 * Analyze recent automated company research stage usage from stored metadata.
 * npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/analyze-research-stages.ts
 */
import { PrismaClient } from "@prisma/client";
import type { ResearchStageTiming } from "../../src/lib/research/types";

const prisma = new PrismaClient();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * p)),
  );
  return sorted[idx]!;
}

function parseStageTimings(raw: unknown): ResearchStageTiming[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ResearchStageTiming =>
      Boolean(item) &&
      typeof item === "object" &&
      (item as ResearchStageTiming).stage != null &&
      typeof (item as ResearchStageTiming).durationMs === "number",
  );
}

async function main() {
  const rows = await prisma.companyResearch.findMany({
    where: {
      status: { in: ["COMPLETED", "PARTIAL"] },
      researchMethod: "AUTOMATED",
      researchedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      researchDurationMs: { not: null },
    },
    orderBy: { researchedAt: "desc" },
    take: 500,
    select: {
      webSearchCallCount: true,
      researchDurationMs: true,
      searchStagesUsed: true,
      researchStoppedReason: true,
      researchStageTimings: true,
      sourceCount: true,
      researchConfidence: true,
      inputTokens: true,
      outputTokens: true,
      researchedAt: true,
      aiModel: true,
    },
  });

  const byWeb = new Map<number, number>();
  const byStages = new Map<number, number>();
  const byStopped = new Map<string, number>();
  const prefetchDurations: number[] = [];
  const webSearchDurations: number[] = [];

  for (const row of rows) {
    const webKey = row.webSearchCallCount ?? -1;
    byWeb.set(webKey, (byWeb.get(webKey) ?? 0) + 1);

    if (row.searchStagesUsed != null) {
      byStages.set(
        row.searchStagesUsed,
        (byStages.get(row.searchStagesUsed) ?? 0) + 1,
      );
    }

    if (row.researchStoppedReason) {
      byStopped.set(
        row.researchStoppedReason,
        (byStopped.get(row.researchStoppedReason) ?? 0) + 1,
      );
    }

    for (const timing of parseStageTimings(row.researchStageTimings)) {
      if (timing.webSearchEnabled) webSearchDurations.push(timing.durationMs);
      else prefetchDurations.push(timing.durationMs);
    }
  }

  const durations = rows
    .map((row) => row.researchDurationMs!)
    .sort((a, b) => a - b);

  const atCap = rows.filter((row) => (row.webSearchCallCount ?? 0) >= 3).length;
  const withStageData = rows.filter((row) => row.searchStagesUsed != null).length;

  console.log(
    JSON.stringify(
      {
        sampleSize: rows.length,
        withPersistedStageData: withStageData,
        webSearchCallCountDistribution: Object.fromEntries(
          [...byWeb.entries()].sort((a, b) => a[0] - b[0]),
        ),
        searchStagesUsedDistribution: Object.fromEntries(
          [...byStages.entries()].sort((a, b) => a[0] - b[0]),
        ),
        researchStoppedReasonDistribution: Object.fromEntries(
          [...byStopped.entries()].sort((a, b) => a[0].localeCompare(b[0])),
        ),
        atThreeSearchCap: atCap,
        atThreeSearchCapPct:
          rows.length > 0
            ? Number(((atCap / rows.length) * 100).toFixed(1))
            : 0,
        researchDurationMs: {
          avg: Math.round(
            durations.reduce((sum, value) => sum + value, 0) /
              (durations.length || 1),
          ),
          p50: percentile(durations, 0.5),
          p90: percentile(durations, 0.9),
          min: durations[0] ?? 0,
          max: durations[durations.length - 1] ?? 0,
        },
        perStageDurationMs: {
          prefetch: prefetchDurations.length
            ? {
                count: prefetchDurations.length,
                avg: Math.round(
                  prefetchDurations.reduce((s, v) => s + v, 0) /
                    prefetchDurations.length,
                ),
                p50: percentile(
                  [...prefetchDurations].sort((a, b) => a - b),
                  0.5,
                ),
              }
            : null,
          webSearch: webSearchDurations.length
            ? {
                count: webSearchDurations.length,
                avg: Math.round(
                  webSearchDurations.reduce((s, v) => s + v, 0) /
                    webSearchDurations.length,
                ),
                p50: percentile(
                  [...webSearchDurations].sort((a, b) => a - b),
                  0.5,
                ),
              }
            : null,
        },
        sourceCount: {
          avg: Number(
            (
              rows.reduce((sum, row) => sum + row.sourceCount, 0) /
              (rows.length || 1)
            ).toFixed(1),
          ),
        },
        models: [...new Set(rows.map((row) => row.aiModel).filter(Boolean))],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
