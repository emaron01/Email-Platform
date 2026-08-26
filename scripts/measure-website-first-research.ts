/**
 * Snapshot + optional force-refresh of production CompanyResearch for
 * website-first measurement. Writes nothing unless --refresh is passed
 * AND MEASURE_RESEARCH_ALLOW_PROD=1.
 *
 * Usage:
 *   npx dotenv -e .env.local -e .env -- tsx scripts/measure-website-first-research.ts --snapshot
 *   MEASURE_RESEARCH_ALLOW_PROD=1 npx dotenv -e .env.local -e .env -- tsx scripts/measure-website-first-research.ts --refresh
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { AiCompanyResearchProvider } from "../src/lib/research/provider";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "../src/lib/usage/defaults";
import { researchExpiresAt } from "../src/lib/research/freshness";

type SourceRow = {
  url?: string;
  sourceType?: string;
  supports?: string[];
};

type SnapshotRow = {
  companyId: string;
  organizationId: string;
  name: string;
  website: string | null;
  normalizedDomain: string | null;
  researchId: string;
  status: string;
  confidence: string | null;
  sourceCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  webSearchCallCount: number | null;
  emptySupports: number;
  companySummary: string | null;
  whatTheySell: string | null;
  businessModel: string | null;
  companySizeContext: string | null;
  customerTypes: unknown;
  primaryMarkets: unknown;
  aiModel: string | null;
  researchedAt: string | null;
};

const OUT_DIR = join(process.cwd(), "tmp", "research-measure");

function orgFilter(): Prisma.OrganizationWhereInput {
  return {
    NOT: [
      { name: { startsWith: "[TEST]" } },
      { name: { startsWith: "[DEV]" } },
    ],
  };
}

function parseSources(raw: unknown): SourceRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as SourceRow[];
}

function emptySupportCount(sources: SourceRow[]): number {
  return sources.filter((s) => !Array.isArray(s.supports) || s.supports.length === 0)
    .length;
}

function fieldText(row: SnapshotRow): string {
  return [
    row.companySummary,
    row.whatTheySell,
    row.businessModel,
    row.companySizeContext,
    JSON.stringify(row.customerTypes ?? null),
    JSON.stringify(row.primaryMarkets ?? null),
  ]
    .map((v) => (v ?? "").toString().trim())
    .join("\n");
}

function textDelta(a: string, b: string): number {
  if (a === b) return 0;
  const max = Math.max(a.length, b.length, 1);
  let same = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] === b[i]) same += 1;
  }
  return 1 - same / max;
}

async function loadLatestRows(prisma: PrismaClient): Promise<SnapshotRow[]> {
  const rows = await prisma.companyResearch.findMany({
    where: {
      status: { in: ["COMPLETED", "PARTIAL"] },
      organization: orgFilter(),
    },
    orderBy: { researchedAt: "desc" },
    select: {
      id: true,
      companyId: true,
      organizationId: true,
      status: true,
      researchConfidence: true,
      sourceCount: true,
      inputTokens: true,
      outputTokens: true,
      webSearchCallCount: true,
      companySummary: true,
      whatTheySell: true,
      businessModel: true,
      companySizeContext: true,
      customerTypes: true,
      primaryMarkets: true,
      researchSources: true,
      aiModel: true,
      researchedAt: true,
      company: {
        select: {
          name: true,
          website: true,
          normalizedDomain: true,
        },
      },
    },
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.companyId)) latest.set(row.companyId, row);
  }

  return [...latest.values()].map((row) => {
    const sources = parseSources(row.researchSources);
    return {
      companyId: row.companyId,
      organizationId: row.organizationId,
      name: row.company.name,
      website: row.company.website,
      normalizedDomain: row.company.normalizedDomain,
      researchId: row.id,
      status: row.status,
      confidence: row.researchConfidence,
      sourceCount: row.sourceCount,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      webSearchCallCount: row.webSearchCallCount,
      emptySupports: emptySupportCount(sources),
      companySummary: row.companySummary,
      whatTheySell: row.whatTheySell,
      businessModel: row.businessModel,
      companySizeContext: row.companySizeContext,
      customerTypes: row.customerTypes,
      primaryMarkets: row.primaryMarkets,
      aiModel: row.aiModel,
      researchedAt: row.researchedAt?.toISOString() ?? null,
    };
  });
}

function summarize(rows: SnapshotRow[]) {
  const n = rows.length || 1;
  const inputSum = rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  const outputSum = rows.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
  const webSum = rows.reduce((s, r) => s + (r.webSearchCallCount ?? 0), 0);
  const emptySupports = rows.reduce((s, r) => s + r.emptySupports, 0);
  const sourceSlots = rows.reduce((s, r) => s + r.sourceCount, 0);
  return {
    companies: rows.length,
    inputSum,
    outputSum,
    webSearchSum: webSum,
    inputMean: Math.round(inputSum / n),
    outputMean: Math.round(outputSum / n),
    webSearchMean: Number((webSum / n).toFixed(2)),
    sourceCountMean: Number((sourceSlots / n).toFixed(2)),
    emptySupports,
    emptySupportRate:
      sourceSlots === 0
        ? null
        : Number(((emptySupports / sourceSlots) * 100).toFixed(1)),
  };
}

/** Rough OpenAI GPT-4.1 / GPT-4o-class list price fallback for reporting. */
function estimateUsd(inputTokens: number, outputTokens: number, webCalls: number) {
  const inputCost = (inputTokens / 1_000_000) * 2.5;
  const outputCost = (outputTokens / 1_000_000) * 10;
  const webCost = webCalls * 0.025;
  return Number((inputCost + outputCost + webCost).toFixed(4));
}

async function snapshotOnly(prisma: PrismaClient) {
  const rows = await loadLatestRows(prisma);
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "before.json");
  writeFileSync(path, JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2));
  console.log(JSON.stringify({ wrote: path, summary: summarize(rows) }, null, 2));
}

async function refreshAll(prisma: PrismaClient) {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const isRender = host.includes("render.com");
  if (isRender && process.env.MEASURE_RESEARCH_ALLOW_PROD !== "1") {
    throw new Error(
      "Refusing production refresh. Set MEASURE_RESEARCH_ALLOW_PROD=1 after reviewing the before snapshot.",
    );
  }

  const providerName = process.env.RESEARCH_AI_PROVIDER?.trim();
  const apiKey = process.env.RESEARCH_AI_API_KEY?.trim() ?? "";
  if (
    providerName !== "openai-responses" ||
    !apiKey ||
    apiKey.includes("YOUR_") ||
    (process.env.RESEARCH_AI_MODEL ?? "").includes("YOUR_")
  ) {
    throw new Error(
      "Research AI is not configured for live refresh. Set RESEARCH_AI_PROVIDER=openai-responses and real MODEL/URL/API_KEY.",
    );
  }

  const beforePath = join(OUT_DIR, "before.json");
  if (!existsSync(beforePath)) {
    await snapshotOnly(prisma);
  }
  const before = JSON.parse(readFileSync(beforePath, "utf8")) as {
    rows: SnapshotRow[];
  };

  const provider = new AiCompanyResearchProvider();
  const policy = await prisma.researchPolicy.findFirst({
    where: { organizationId: before.rows[0]?.organizationId },
  });
  const depth = {
    maxSearchQueriesPerCompany:
      policy?.maxSearchQueriesPerCompany ??
      DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
    maxSourcesPerCompany:
      policy?.maxSourcesPerCompany ??
      DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
    researchFreshnessDays:
      policy?.researchFreshnessDays ??
      DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
  };

  const afterRows: Array<
    SnapshotRow & {
      stoppedReason: string | null;
      searchStagesUsed: number | null;
      error?: string;
    }
  > = [];

  for (const row of before.rows) {
    process.stdout.write(`Refreshing ${row.name}... `);
    try {
      const result = await provider.research({
        organizationId: row.organizationId,
        companyId: row.companyId,
        name: row.name,
        website: row.website,
        normalizedDomain: row.normalizedDomain,
        industry: null,
        employeeCount: null,
        location: null,
        depthPolicy: depth,
      });

      const now = new Date();
      const saved = await prisma.companyResearch.create({
        data: {
          organizationId: row.organizationId,
          companyId: row.companyId,
          status:
            result.identityAmbiguous ||
            (result.sources.length === 0 &&
              !result.companySummary &&
              !result.whatTheySell)
              ? "PARTIAL"
              : "COMPLETED",
          researchMethod: "AUTOMATED",
          companySummary: result.companySummary,
          whatTheySell: result.whatTheySell,
          customerTypes: result.customerTypes,
          primaryMarkets: result.primaryMarkets,
          businessModel: result.businessModel,
          estimatedAov: result.estimatedAov,
          aovReasoning: result.aovReasoning,
          companySizeContext: result.companySizeContext,
          relevantTechnologies: result.relevantTechnologies,
          buyingSignals: result.buyingSignals,
          riskSignals: result.riskSignals,
          researchConfidence: result.confidence,
          sourceCount: result.sources.length,
          researchSources: result.sources,
          researchedAt: now,
          expiresAt: researchExpiresAt(now, depth.researchFreshnessDays),
          aiProvider: result.provenance.aiProvider,
          aiModel: result.provenance.aiModel,
          aiModelUrlIdentifier: result.provenance.aiModelUrlIdentifier,
          promptVersion: result.provenance.promptVersion,
          inputTokens: result.usage?.inputTokens ?? null,
          outputTokens: result.usage?.outputTokens ?? null,
          webSearchCallCount: result.usage?.webSearchCallCount ?? null,
          researchDurationMs: result.usage?.researchDurationMs ?? null,
        },
      });

      afterRows.push({
        companyId: row.companyId,
        organizationId: row.organizationId,
        name: row.name,
        website: row.website,
        normalizedDomain: row.normalizedDomain,
        researchId: saved.id,
        status: saved.status,
        confidence: saved.researchConfidence,
        sourceCount: saved.sourceCount,
        inputTokens: saved.inputTokens,
        outputTokens: saved.outputTokens,
        webSearchCallCount: saved.webSearchCallCount,
        emptySupports: emptySupportCount(parseSources(saved.researchSources)),
        companySummary: saved.companySummary,
        whatTheySell: saved.whatTheySell,
        businessModel: saved.businessModel,
        companySizeContext: saved.companySizeContext,
        customerTypes: saved.customerTypes,
        primaryMarkets: saved.primaryMarkets,
        aiModel: saved.aiModel,
        researchedAt: saved.researchedAt?.toISOString() ?? null,
        stoppedReason: result.stoppedReason ?? null,
        searchStagesUsed: result.searchStagesUsed ?? null,
      });
      console.log(
        `ok in=${saved.inputTokens} web=${saved.webSearchCallCount} sources=${saved.sourceCount} stop=${result.stoppedReason}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAIL ${message}`);
      afterRows.push({
        ...row,
        stoppedReason: null,
        searchStagesUsed: null,
        error: message,
      });
    }
  }

  const comparison = before.rows.map((b) => {
    const a = afterRows.find((r) => r.companyId === b.companyId)!;
    const inputDelta = (a.inputTokens ?? 0) - (b.inputTokens ?? 0);
    const outputDelta = (a.outputTokens ?? 0) - (b.outputTokens ?? 0);
    const webDelta =
      (a.webSearchCallCount ?? 0) - (b.webSearchCallCount ?? 0);
    const contentChange = textDelta(fieldText(b), fieldText(a));
    const confidenceChanged = b.confidence !== a.confidence;
    const changeScore =
      Math.abs(inputDelta) / 1000 +
      contentChange * 10 +
      (confidenceChanged ? 2 : 0) +
      Math.abs(a.sourceCount - b.sourceCount);
    return {
      name: b.name,
      companyId: b.companyId,
      before: {
        inputTokens: b.inputTokens,
        outputTokens: b.outputTokens,
        webSearchCallCount: b.webSearchCallCount,
        sourceCount: b.sourceCount,
        emptySupports: b.emptySupports,
        confidence: b.confidence,
      },
      after: {
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        webSearchCallCount: a.webSearchCallCount,
        sourceCount: a.sourceCount,
        emptySupports: a.emptySupports,
        confidence: a.confidence,
        stoppedReason: a.stoppedReason,
        searchStagesUsed: a.searchStagesUsed,
        error: a.error,
      },
      inputDelta,
      outputDelta,
      webDelta,
      contentChange: Number(contentChange.toFixed(3)),
      confidenceChanged,
      changeScore: Number(changeScore.toFixed(3)),
    };
  });

  comparison.sort((x, y) => y.changeScore - x.changeScore);

  const beforeSummary = summarize(before.rows);
  const afterOk = afterRows.filter((r) => !r.error);
  const afterSummary = summarize(afterOk);

  const report = {
    capturedAt: new Date().toISOString(),
    beforeSummary,
    afterSummary,
    beforeCostUsdEstimate: estimateUsd(
      beforeSummary.inputSum,
      beforeSummary.outputSum,
      beforeSummary.webSearchSum,
    ),
    afterCostUsdEstimate: estimateUsd(
      afterSummary.inputSum,
      afterSummary.outputSum,
      afterSummary.webSearchSum,
    ),
    websiteSufficientCount: afterOk.filter(
      (r) => r.stoppedReason === "website_sufficient",
    ).length,
    webSearchNeededCount: afterOk.filter(
      (r) => r.stoppedReason !== "website_sufficient",
    ).length,
    topChangedForReview: comparison.slice(0, 3).map((c) => ({
      name: c.name,
      companyId: c.companyId,
      inputDelta: c.inputDelta,
      contentChange: c.contentChange,
      confidenceChanged: c.confidenceChanged,
      beforeSources: c.before.sourceCount,
      afterSources: c.after.sourceCount,
      stoppedReason: c.after.stoppedReason,
    })),
    comparison,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "after.json"), JSON.stringify({ rows: afterRows }, null, 2));
  writeFileSync(join(OUT_DIR, "comparison.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const snapshot = args.includes("--snapshot");
  const refresh = args.includes("--refresh");
  if (snapshot === refresh) {
    console.error("Usage: --snapshot | --refresh");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    if (snapshot) await snapshotOnly(prisma);
    else await refreshAll(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
