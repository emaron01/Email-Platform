import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualCompanyResearchForm } from "@/components/ManualCompanyResearchForm";
import { RefreshCompanyResearchForm } from "@/components/RefreshCompanyResearchForm";
import {
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import {
  getCompany,
  researchStatusLabel,
} from "@/lib/tenant/companies";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { parseStringArray } from "@/lib/research";
import { formatDate, formatNumber } from "@/lib/utils";
import type { ResearchSource } from "@/lib/research";

type PageProps = {
  params: Promise<{ companyId: string }>;
};

export default async function CompanyResearchPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { companyId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Company" description="Company research." />
        <TenantMissing />
      </div>
    );
  }

  let company;
  try {
    company = await getCompany(companyId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const latest = company.research[0] ?? null;
  const sources = Array.isArray(latest?.researchSources)
    ? (latest.researchSources as ResearchSource[])
    : [];

  return (
    <div>
      <PageHeader
        title={company.name}
        description="Tenant-scoped company intelligence. Product/ICP fit is scored later — this page describes the company itself."
        actions={
          <Link
            href="/lists"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to lists
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Meta label="Website" value={company.website ?? "—"} />
        <Meta label="Domain" value={company.normalizedDomain ?? "—"} />
        <Meta label="Industry" value={company.industry ?? "—"} />
        <Meta
          label="Employees"
          value={
            company.employeeCount != null
              ? formatNumber(company.employeeCount)
              : "—"
          }
        />
        <Meta
          label="Revenue"
          value={
            company.revenue != null ? String(company.revenue) : "—"
          }
        />
        <Meta label="Location" value={company.location ?? "—"} />
        <Meta
          label="Research Status"
          value={researchStatusLabel(latest?.status)}
        />
        <Meta
          label="Confidence"
          value={latest?.researchConfidence ?? "—"}
        />
        <Meta
          label="Method"
          value={latest?.researchMethod ?? "—"}
        />
        <Meta
          label="Research Model"
          value={latest?.aiModel ?? "—"}
        />
        <Meta
          label="Research Prompt"
          value={latest?.promptVersion ?? "—"}
        />
        <Meta
          label="Last Researched"
          value={
            latest?.researchedAt ? formatDate(latest.researchedAt) : "—"
          }
        />
      </div>

      <div className="mb-6">
        <RefreshCompanyResearchForm companyId={company.id} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Company Intelligence"
          description="Only show fields that have content — empty means not researched, not verified empty."
        >
          <div className="grid gap-3 text-sm text-slate-700">
            <Detail label="Company Summary" value={latest?.companySummary} />
            <Detail label="What They Sell" value={latest?.whatTheySell} />
            <Detail
              label="Customer Types"
              value={joinList(latest?.customerTypes)}
            />
            <Detail
              label="Primary Markets"
              value={joinList(latest?.primaryMarkets)}
            />
            <Detail label="Business Model" value={latest?.businessModel} />
            <Detail label="Estimated AOV" value={latest?.estimatedAov} />
            <Detail label="AOV Reasoning" value={latest?.aovReasoning} />
            <Detail
              label="Company Size Context"
              value={latest?.companySizeContext}
            />
            <Detail
              label="Relevant Technologies"
              value={joinList(latest?.relevantTechnologies)}
            />
            <Detail
              label="Buying Signals"
              value={joinList(latest?.buyingSignals)}
            />
            <Detail
              label="Risk Signals"
              value={joinList(latest?.riskSignals)}
            />
          </div>
        </Panel>

        <Panel
          title="Sources"
          description="Provenance for researched findings. Empty until sources are recorded."
        >
          {sources.length === 0 ? (
            <p className="text-sm text-slate-500">No sources recorded.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {sources.map((source, index) => (
                <li
                  key={`${source.url}-${index}`}
                  className="rounded-md border border-slate-200 px-3 py-2"
                >
                  <p className="font-medium text-slate-900">
                    {source.title || source.url}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {source.sourceType}
                    {source.publisher ? ` · ${source.publisher}` : ""}
                  </p>
                  <a
                    href={source.url}
                    className="mt-1 block truncate text-xs text-slate-700 underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.url}
                  </a>
                  {source.supports?.length ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Supports: {source.supports.join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="Manual Research Override"
          description="Organization users can add or correct company intelligence. Marked MANUAL or HYBRID."
        >
          <ManualCompanyResearchForm
            companyId={company.id}
            defaults={{
              companySummary: latest?.companySummary ?? null,
              whatTheySell: latest?.whatTheySell ?? null,
              estimatedAov: latest?.estimatedAov ?? null,
              aovReasoning: latest?.aovReasoning ?? null,
              customerTypes: latest?.customerTypes,
              primaryMarkets: latest?.primaryMarkets,
              businessModel: latest?.businessModel ?? null,
              companySizeContext: latest?.companySizeContext ?? null,
              relevantTechnologies: latest?.relevantTechnologies,
              buyingSignals: latest?.buyingSignals,
              riskSignals: latest?.riskSignals,
              researchConfidence: latest?.researchConfidence ?? null,
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-slate-400">Not researched</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function joinList(value: unknown): string | null {
  const list = parseStringArray(value);
  return list.length ? list.join("; ") : null;
}
