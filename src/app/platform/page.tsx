import Link from "next/link";
import {
  canEditTransactionalTemplates,
  requirePlatformOperator,
} from "@/lib/auth/authz";
import { ensureAiModelRatesSeeded } from "@/lib/platform/model-rates";
import {
  computeCostReport,
  getLatestSpendDrift,
} from "@/lib/platform/cost";

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatRatio(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}

export default async function PlatformHomePage() {
  const user = await requirePlatformOperator();
  await ensureAiModelRatesSeeded();

  const [report, drift] = await Promise.all([
    computeCostReport({ window: "30d" }),
    getLatestSpendDrift(),
  ]);

  const canEditTemplates = canEditTransactionalTemplates(user.platformRole);
  const proj300 = report.projections.find((p) => p.emails === 300);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ops home — cost/margin signals and org administration.
        </p>
      </div>

      {drift.hasDrift && drift.latest ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-medium">Provider spend drift above threshold</p>
          <p className="mt-1 text-amber-900">
            Latest {drift.latest.provider} reconciliation:{" "}
            {drift.latest.driftPercent.toFixed(1)}% drift (threshold{" "}
            {drift.thresholdPercent}%). Reported $
            {drift.latest.providerReportedUsd.toFixed(2)} vs estimated $
            {drift.latest.estimatedUsd.toFixed(2)}.
          </p>
          <p className="mt-2">
            <Link
              href="/platform/costs#reconciliation"
              className="font-medium underline"
            >
              Review costs &amp; reconciliation
            </Link>
          </p>
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/platform/orgs"
          className="font-medium text-slate-800 underline"
        >
          Organizations
        </Link>
        <Link
          href="/platform/costs"
          className="font-medium text-slate-800 underline"
        >
          Costs &amp; margin
        </Link>
        {canEditTemplates ? (
          <Link
            href="/platform/email-templates"
            className="font-medium text-slate-800 underline"
          >
            Email templates
          </Link>
        ) : null}
      </nav>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Last 30 days (platform-wide)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Cost / company
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(report.costPerCompanyUsd)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Contacts / company
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatRatio(report.contactsPerCompany)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Projected 300-email month
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(proj300?.estimatedMonthlyUsd ?? null)}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Projections use observed contact-per-company ratio and DB-backed model
          rates. See{" "}
          <Link href="/platform/costs" className="underline">
            Costs &amp; margin
          </Link>{" "}
          for detail.
        </p>
      </section>
    </div>
  );
}
