import { PageHeader, TenantMissing } from "@/components/ui";
import { getDashboardMetrics } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getCurrentUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Invalid verification must not land here — callbackURL is /post-verify.
  // If a stale link still hits /?error=…, send users to the verification UX.
  // (searchParams handled via redirect from middleware is not available here
  // for all cases; post-verify is the primary path.)

  const [organization, user] = await Promise.all([
    getCurrentOrganization(),
    getCurrentUser(),
  ]);

  if (!organization) {
    if (user?.platformRole === "SUPER_ADMIN") {
      redirect("/settings/account");
    }
    if (user) {
      redirect("/no-workspace");
    }
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
