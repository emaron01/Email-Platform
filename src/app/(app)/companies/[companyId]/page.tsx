import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyResearchBriefing } from "@/components/CompanyResearchBriefing";
import { PageHeader, TenantMissing } from "@/components/ui";
import {
  getCompany,
  researchStatusLabel,
} from "@/lib/tenant/companies";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
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
    <div className="mx-auto max-w-3xl space-y-8">
      <div data-print-hide>
        <PageHeader
          title="Company briefing"
          description="Prospect intelligence for meeting prep. Product/ICP fit is scored separately."
          actions={
            <Link
              href="/lists"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back to lists
            </Link>
          }
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-8">
        <CompanyResearchBriefing
          companyId={company.id}
          companyName={company.name}
          meta={{
            domain: company.normalizedDomain ?? company.website,
            industry: company.industry,
            location: company.location,
            employeeCount:
              company.employeeCount != null
                ? formatNumber(company.employeeCount)
                : null,
            revenue:
              company.revenue != null ? String(company.revenue) : null,
            confidence: latest?.researchConfidence ?? null,
            lastResearched: latest?.researchedAt
              ? formatDate(latest.researchedAt)
              : null,
          }}
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
          sources={sources}
          researchMethod={latest?.researchMethod ?? null}
          researchStatus={researchStatusLabel(latest?.status)}
        />
      </section>
    </div>
  );
}
