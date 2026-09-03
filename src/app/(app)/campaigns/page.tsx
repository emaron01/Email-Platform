import Link from "next/link";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { EmptyState, PageHeader, TenantMissing } from "@/components/ui";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { listCampaigns } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { formatDate } from "@/lib/utils";
import { getHomeWorkflow } from "@/lib/workflow/home";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const includeArchived = query.archived === "1";

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Campaigns"
          description="Campaigns belonging to the active organization."
        />
        <TenantMissing />
      </div>
    );
  }

  const [campaigns, workflow] = await Promise.all([
    listCampaigns({ includeArchived }),
    getHomeWorkflow(organization.id),
  ]);

  const canCreate = workflow.campaignProducts.length > 0;

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Each campaign selects a product, an ICP, personas in play, and a campaign-specific offer. Open a campaign to attach contacts and work through qualification and email."
        actions={
          <>
            <ShowArchivedToggle
              href={includeArchived ? "/campaigns" : "/campaigns?archived=1"}
              includeArchived={includeArchived}
              label="campaigns"
            />
            {canCreate ? (
              <Link
                href="/campaigns/new"
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
              >
                New campaign
              </Link>
            ) : (
              <span
                title="Add a product first"
                className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-slate-300 px-3.5 py-2 text-sm font-medium text-slate-500"
              >
                New campaign
              </span>
            )}
          </>
        }
      />

      <DeleteSuccessNotice />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="A campaign ties your product setup to a contact list — qualify companies, score contacts, and write emails in one workspace."
          actions={
            canCreate ? (
              <Link
                href="/campaigns/new"
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                New campaign
              </Link>
            ) : (
              <Link
                href="/products/new"
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                New product
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">ICP</th>
                <th className="px-4 py-3 font-medium">Offer</th>
                <th className="px-4 py-3 font-medium">Contacts</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {campaign.name}
                    </Link>
                    {campaign.archivedAt ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Archived
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.status}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.product.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.icp.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.offerName ?? campaign.offer?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign._count.contacts}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(campaign.createdAt)}
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
