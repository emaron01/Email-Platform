import Link from "next/link";
import { AddContactsWizard } from "@/components/AddContactsWizard";
import { CompanyResearchAllowanceBanner } from "@/components/CompanyResearchAllowanceBanner";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import {
  EmptyState,
  PageHeader,
  TenantMissing,
} from "@/components/ui";
import { loadResearchBillingContext } from "@/lib/billing/research-billing-context";
import { getMembershipForCurrentUser } from "@/lib/org/authz";
import {
  campaignListStageHref,
  listDetailHref,
  listIndexHref,
  parseCampaignId,
} from "@/lib/lists/campaign-query";
import {
  getCampaignForListWorkflow,
  listContactLists,
} from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getActiveResearchedCompanyUsage } from "@/lib/usage/quota";
import { formatDate, formatNumber } from "@/lib/utils";

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; campaign?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const includeArchived = query.archived === "1";
  const campaignId = parseCampaignId(query.campaign);

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Lists"
          description="Contact lists for this organization."
        />
        <TenantMissing />
      </div>
    );
  }

  const membership = await getMembershipForCurrentUser(organization.id);
  const [lists, researchAllowance, researchBilling, campaign] =
    await Promise.all([
      listContactLists({ includeArchived }),
      getActiveResearchedCompanyUsage({
        organizationId: organization.id,
        userId: membership.user.id,
      }),
      loadResearchBillingContext(organization.id),
      campaignId ? getCampaignForListWorkflow(campaignId) : Promise.resolve(null),
    ]);
  const workflowCampaignId = campaign?.id ?? null;

  return (
    <div>
      <PageHeader
        title="Lists"
        description="Create lists by pasting contacts or uploading CSV/XLSX files. All data stays in this organization."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {campaign ? (
              <Link
                href={campaignListStageHref(campaign.id)}
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to {campaign.name}
              </Link>
            ) : null}
            <ShowArchivedToggle
              href={listIndexHref({
                campaignId: workflowCampaignId,
                archived: !includeArchived,
              })}
              includeArchived={includeArchived}
              label="lists"
            />
            <AddContactsWizard />
          </div>
        }
      />

      <DeleteSuccessNotice />

      <div className="mb-6 space-y-3">
        <CompanyResearchAllowanceBanner
          usage={researchAllowance}
          billing={researchBilling}
        />
        <p className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
          {campaign
            ? `Select a list to research and score for ${campaign.name}. After scoring, return to the campaign and choose Add from Scored Run.`
            : "Select a list below to research and score your contacts before adding them to a campaign."}
        </p>
      </div>
      {lists.length === 0 ? (
        <EmptyState
          title="No lists yet"
          description="Click Add Contacts to paste spreadsheet data or upload a CSV/XLSX file."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">List Name</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Filename</th>
                <th className="px-4 py-3 font-medium">Total Contacts</th>
                <th className="px-4 py-3 font-medium">Imported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lists.map((list) => (
                <tr key={list.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={listDetailHref(list.id, {
                        campaignId: workflowCampaignId,
                      })}
                      className="hover:underline"
                    >
                      {list.name}
                    </Link>
                    {list.archivedAt ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Archived
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{list.sourceType}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {list.originalFilename ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatNumber(list.totalContacts)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(list.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
