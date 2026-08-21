import { PageHeader, TenantMissing } from "@/components/ui";
import { getDashboardMetrics } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { formatNumber } from "@/lib/utils";

export default async function DashboardPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Organization-scoped overview of lists, contacts, and campaigns."
        />
        <TenantMissing />
      </div>
    );
  }

  const metrics = await getDashboardMetrics();

  const cards = [
    { label: "Total Lists", value: metrics.totalLists },
    { label: "Total Contacts", value: metrics.totalContacts },
    { label: "Scoring Runs", value: metrics.scoringRuns },
    { label: "Contacts Scored", value: metrics.contactsScored },
    { label: "Active Campaigns", value: metrics.activeCampaigns },
    { label: "Draft Emails", value: metrics.draftEmails },
    { label: "Emails Sent", value: metrics.emailsSent },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Metrics for ${organization.name}. Values are live database counts for this organization only.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-200 bg-white px-5 py-4"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {formatNumber(card.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
