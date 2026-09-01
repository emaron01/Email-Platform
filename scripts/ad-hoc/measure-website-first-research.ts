/**
 * Snapshot + force-refresh + report for website-first measurement.
 *
 * Usage:
 *   npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/measure-website-first-research.ts --snapshot
 *   npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/measure-website-first-research.ts --probe-retrieval
 *   npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/measure-website-first-research.ts --report
 *   MEASURE_RESEARCH_ALLOW_PROD=1 npx dotenv -e .env.local -e .env -- tsx scripts/ad-hoc/measure-website-first-research.ts --refresh
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { AiCompanyResearchProvider } from "../../src/lib/research/provider";
import {
  retrieveLegacySinglePageEvidence,
  retrieveWebsiteEvidence,
} from "../../src/lib/research/sources";
import { WEBSITE_FIRST_MIN_EXCERPT_CHARS } from "../../src/lib/research/website-first-sufficiency";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "../../src/lib/usage/defaults";
import { researchExpiresAt } from "../../src/lib/research/freshness";
import { compareFirmographics } from "../../src/lib/research/measure-firmographics";

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
  relevantTechnologies?: unknown;
  buyingSignals?: unknown;
  riskSignals?: unknown;
  estimatedAov?: string | null;
  aovReasoning?: string | null;
  aiModel: string | null;
  researchedAt: string | null;
};

type AfterSnapshotRow = SnapshotRow & {
  stoppedReason?: string | null;
  searchStagesUsed?: number | null;
  websitePrefetchGatePass?: boolean | null;
  error?: string;
};

const OUT_DIR = join(process.cwd(), "tmp", "research-measure");

const PRIMARY_FIELDS = [
  "companySummary",
  "whatTheySell",
  "businessModel",
  "companySizeContext",
  "customerTypes",
] as const;

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

function isPrimaryPopulated(
  row: SnapshotRow,
  field: (typeof PRIMARY_FIELDS)[number],
): boolean {
  const value = row[field];
  if (field === "customerTypes") {
    return Array.isArray(value) && value.length > 0;
  }
  return typeof value === "string" && value.trim().length > 0;
}

function primaryRegressions(
  before: SnapshotRow,
  after: SnapshotRow,
): string[] {
  return PRIMARY_FIELDS.filter(
    (field) =>
      isPrimaryPopulated(before, field) && !isPrimaryPopulated(after, field),
  );
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

function excerptChars(bundle: { excerpts: Array<{ text: string }> }): number {
  return bundle.excerpts.reduce((n, e) => n + e.text.length, 0);
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
      relevantTechnologies: true,
      buyingSignals: true,
      riskSignals: true,
      estimatedAov: true,
      aovReasoning: true,
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
      relevantTechnologies: row.relevantTechnologies,
      buyingSignals: row.buyingSignals,
      riskSignals: row.riskSignals,
      estimatedAov: row.estimatedAov,
      aovReasoning: row.aovReasoning,
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

function estimateUsd(inputTokens: number, outputTokens: number, webCalls: number) {
  const inputCost = (inputTokens / 1_000_000) * 2.5;
  const outputCost = (outputTokens / 1_000_000) * 10;
  const webCost = webCalls * 0.025;
  return Number((inputCost + outputCost + webCost).toFixed(4));
}

function buildComparisonReport(
  before: SnapshotRow[],
  afterRows: AfterSnapshotRow[],
) {
  const comparison = before.map((b) => {
    const a = afterRows.find((r) => r.companyId === b.companyId)!;
    const inputDelta = (a.inputTokens ?? 0) - (b.inputTokens ?? 0);
    const outputDelta = (a.outputTokens ?? 0) - (b.outputTokens ?? 0);
    const webDelta =
      (a.webSearchCallCount ?? 0) - (b.webSearchCallCount ?? 0);
    const contentChange = textDelta(fieldText(b), fieldText(a));
    const confidenceChanged = b.confidence !== a.confidence;
    const regressions = primaryRegressions(b, a);
    const firmographics = compareFirmographics(b, a);
    const stage1Pass = a.websitePrefetchGatePass === true;
    const changeScore =
      Math.abs(inputDelta) / 1000 +
      contentChange * 10 +
      (confidenceChanged ? 2 : 0) +
      Math.abs(a.sourceCount - b.sourceCount) +
      regressions.length * 3;

    return {
      name: b.name,
      companyId: b.companyId,
      stage1Pass,
      firmographics,
      before: {
        inputTokens: b.inputTokens,
        outputTokens: b.outputTokens,
        webSearchCallCount: b.webSearchCallCount,
        sourceCount: b.sourceCount,
        emptySupports: b.emptySupports,
        confidence: b.confidence,
        companySummary: b.companySummary,
        whatTheySell: b.whatTheySell,
        businessModel: b.businessModel,
        companySizeContext: b.companySizeContext,
        customerTypes: b.customerTypes,
        estimatedAov: b.estimatedAov ?? null,
        aovReasoning: b.aovReasoning ?? null,
      },
      after: {
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        webSearchCallCount: a.webSearchCallCount,
        sourceCount: a.sourceCount,
        emptySupports: a.emptySupports,
        confidence: a.confidence,
        stoppedReason: a.stoppedReason ?? null,
        searchStagesUsed: a.searchStagesUsed ?? null,
        companySummary: a.companySummary,
        whatTheySell: a.whatTheySell,
        businessModel: a.businessModel,
        companySizeContext: a.companySizeContext,
        customerTypes: a.customerTypes,
        estimatedAov: a.estimatedAov ?? null,
        aovReasoning: a.aovReasoning ?? null,
        error: a.error,
      },
      inputDelta,
      outputDelta,
      webDelta,
      contentChange: Number(contentChange.toFixed(3)),
      confidenceChanged,
      primaryRegressions: regressions,
      changeScore: Number(changeScore.toFixed(3)),
    };
  });

  comparison.sort((x, y) => y.changeScore - x.changeScore);

  const beforeSummary = summarize(before);
  const afterOk = afterRows.filter((r) => !r.error);
  const afterSummary = summarize(afterOk);

  const stage1Before = before.filter((r) => (r.webSearchCallCount ?? 0) === 0);
  const stage1After = afterOk.filter((r) => r.websitePrefetchGatePass === true);

  const firmographicByCompany = comparison.map((c) => ({
    name: c.name,
    stage1Pass: c.stage1Pass,
    companySizeContext: {
      before: c.firmographics.companySizeContextBefore,
      after: c.firmographics.companySizeContextAfter,
    },
    employeeSignal: {
      before: c.firmographics.employeeSignalBefore,
      after: c.firmographics.employeeSignalAfter,
    },
    revenueSignal: {
      before: c.firmographics.revenueSignalBefore,
      after: c.firmographics.revenueSignalAfter,
    },
    qualificationRegression: c.firmographics.qualificationRegression,
    lostEmployeeCountSignal: c.firmographics.lostEmployeeCountSignal,
    lostRevenueSignal: c.firmographics.lostRevenueSignal,
  }));

  const lostEmployee = comparison.filter(
    (c) => c.firmographics.lostEmployeeCountSignal,
  );
  const lostRevenue = comparison.filter(
    (c) => c.firmographics.lostRevenueSignal,
  );

  return {
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
    stage1PassRate: {
      beforeWidening: {
        passed: stage1Before.map((r) => r.name),
        count: stage1Before.length,
        total: before.length,
        note: "Inferred from webSearchCallCount=0 on stored research (pre-widening single-page era).",
      },
      afterWidening: {
        passed: stage1After.map((r) => r.name),
        count: stage1After.length,
        total: afterOk.length,
      },
    },
    primaryRegressions: comparison
      .filter((c) => c.primaryRegressions.length > 0)
      .map((c) => ({ name: c.name, fields: c.primaryRegressions })),
    qualificationRegressions: {
      lostEmployeeCountSignal: {
        count: lostEmployee.length,
        companies: lostEmployee.map((c) => c.name),
      },
      lostRevenueSignal: {
        count: lostRevenue.length,
        companies: lostRevenue.map((c) => c.name),
      },
      anyQualificationRegression: {
        count: comparison.filter((c) => c.firmographics.qualificationRegression)
          .length,
        companies: comparison
          .filter((c) => c.firmographics.qualificationRegression)
          .map((c) => c.name),
      },
    },
    firmographicByCompany,
    stoneEagle: comparison.find((c) => c.name === "StoneEagle") ?? null,
    topChangedForReview: comparison.slice(0, 3),
    comparison,
  };
}

async function snapshotOnly(prisma: PrismaClient) {
  const rows = await loadLatestRows(prisma);
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "before.json");
  writeFileSync(
    path,
    JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2),
  );
  console.log(JSON.stringify({ wrote: path, summary: summarize(rows) }, null, 2));
}

async function probeRetrieval(prisma: PrismaClient) {
  const rows = await loadLatestRows(prisma);
  const probes = [];

  for (const row of rows) {
    const input = {
      organizationId: row.organizationId,
      companyId: row.companyId,
      name: row.name,
      website: row.website,
      normalizedDomain: row.normalizedDomain,
      industry: null,
      employeeCount: null,
      location: null,
    };
    const [legacy, widened] = await Promise.all([
      retrieveLegacySinglePageEvidence(input),
      retrieveWebsiteEvidence(input),
    ]);
    probes.push({
      name: row.name,
      website: row.website,
      legacyExcerptChars: excerptChars(legacy),
      widenedExcerptChars: excerptChars(widened),
      legacyPages: legacy.excerpts.length,
      widenedPages: widened.excerpts.length,
      widenedUrls: widened.excerpts.map((e) => e.url),
      legacyPassesExcerptGate:
        excerptChars(legacy) >= WEBSITE_FIRST_MIN_EXCERPT_CHARS,
      widenedPassesExcerptGate:
        excerptChars(widened) >= WEBSITE_FIRST_MIN_EXCERPT_CHARS,
    });
  }

  const report = {
    capturedAt: new Date().toISOString(),
    excerptGateMin: WEBSITE_FIRST_MIN_EXCERPT_CHARS,
    legacyExcerptPass: probes.filter((p) => p.legacyPassesExcerptGate).map((p) => p.name),
    widenedExcerptPass: probes.filter((p) => p.widenedPassesExcerptGate).map((p) => p.name),
    probes,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "retrieval-probe.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

function reportFromSnapshots() {
  const beforePath = join(OUT_DIR, "before.json");
  const afterPath = join(OUT_DIR, "after.json");
  if (!existsSync(beforePath) || !existsSync(afterPath)) {
    throw new Error("Need tmp/research-measure/before.json and after.json");
  }
  const before = JSON.parse(readFileSync(beforePath, "utf8")) as {
    rows: SnapshotRow[];
  };
  const after = JSON.parse(readFileSync(afterPath, "utf8")) as {
    rows: AfterSnapshotRow[];
  };
  const report = buildComparisonReport(before.rows, after.rows);
  writeFileSync(
    join(OUT_DIR, "comparison.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
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

  mkdirSync(OUT_DIR, { recursive: true });
  const rows = await loadLatestRows(prisma);
  writeFileSync(
    join(OUT_DIR, "before-refresh.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2),
  );

  const beforePath = join(OUT_DIR, "before.json");
  if (!existsSync(beforePath)) {
    writeFileSync(
      beforePath,
      JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2),
    );
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

  const afterRows: AfterSnapshotRow[] = [];

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
        relevantTechnologies: saved.relevantTechnologies,
        buyingSignals: saved.buyingSignals,
        riskSignals: saved.riskSignals,
        estimatedAov: saved.estimatedAov,
        aovReasoning: saved.aovReasoning,
        aiModel: saved.aiModel,
        researchedAt: saved.researchedAt?.toISOString() ?? null,
        stoppedReason: result.stoppedReason ?? null,
        searchStagesUsed: result.searchStagesUsed ?? null,
        websitePrefetchGatePass: result.websitePrefetchGatePass ?? null,
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

  const report = buildComparisonReport(before.rows, afterRows);
  writeFileSync(join(OUT_DIR, "after.json"), JSON.stringify({ rows: afterRows }, null, 2));
  writeFileSync(join(OUT_DIR, "comparison.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const modes = [
    "--snapshot",
    "--refresh",
    "--probe-retrieval",
    "--report",
  ].filter((m) => args.includes(m));
  if (modes.length !== 1) {
    console.error("Usage: --snapshot | --probe-retrieval | --report | --refresh");
    process.exit(1);
  }

  if (modes[0] === "--report") {
    reportFromSnapshots();
    return;
  }

  const prisma = new PrismaClient();
  try {
    if (modes[0] === "--snapshot") await snapshotOnly(prisma);
    else if (modes[0] === "--probe-retrieval") await probeRetrieval(prisma);
    else await refreshAll(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
