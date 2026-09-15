import Link from "next/link";
import { useSharedCampaignAction } from "@/app/actions/campaign-sharing";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { EmptyState, PageHeader, PRIMARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  CAMPAIGN_LIST_VIEW_ALL_ACTIVITY,
  CAMPAIGN_LIST_VIEW_MY,
  CAMPAIGN_LIST_VIEW_SHARED_ALL,
  canViewAllActivity,
  parseCampaignListViewMode,
  shouldUseSharedCampaign,
} from "@/lib/campaign/visibility";
import { listCampaigns } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { cn, formatDate } from "@/lib/utils";
import { getHomeWorkflow } from "@/lib/workflow/home";

function viewHref(
  view: string,
  includeArchived: boolean,
): string {
  const params = new URLSearchParams();
  if (view !== CAMPAIGN_LIST_VIEW_MY) params.set("view", view);
  if (includeArchived) params.set("archived", "1");
  const qs = params.toString();
  return qs ? `/campaigns?${qs}` : "/campaigns";
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; view?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const includeArchived = query.archived === "1";
  const view = parseCampaignListViewMode(query.view);

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

  const [user, membershipCtx] = await Promise.all([
    requireCurrentUser(),
    getMembershipForCurrentUser(organization.id),
  ]);
  const showAllActivity = canViewAllActivity(membershipCtx.membership.role);
  const effectiveView =
    view === CAMPAIGN_LIST_VIEW_ALL_ACTIVITY && !showAllActivity
      ? CAMPAIGN_LIST_VIEW_MY
      : view;

  const [campaigns, workflow] = await Promise.all([
    listCampaigns({
      includeArchived,
      view: effectiveView,
      userId: user.id,
    }),
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
              href={viewHref(effectiveView, !includeArchived)}
              includeArchived={includeArchived}
              label="campaigns"
            />
            {canCreate ? (
              <Link
                href="/campaigns/new"
                className={PRIMARY_BUTTON_CLASS}
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

      <div
        className="mb-4 flex flex-wrap gap-2"
        data-testid="campaign-view-toggle"
      >
        {(
          [
            { id: CAMPAIGN_LIST_VIEW_MY, label: "My Campaigns" },
            { id: CAMPAIGN_LIST_VIEW_SHARED_ALL, label: "All Campaigns" },
            ...(showAllActivity
              ? [
                  {
                    id: CAMPAIGN_LIST_VIEW_ALL_ACTIVITY,
                    label: "All activity",
                  } as const,
                ]
              : []),
          ] as const
        ).map((tab) => (
          <Link
            key={tab.id}
            href={viewHref(tab.id, includeArchived)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              effectiveView === tab.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <DeleteSuccessNotice />

      {campaigns.length === 0 ? (
        <EmptyState
          title={
            effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL
              ? "No shared campaigns"
              : effectiveView === CAMPAIGN_LIST_VIEW_ALL_ACTIVITY
                ? "No shared campaign activity yet"
                : "No campaigns yet"
          }
          description={
            effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL
              ? "Shared campaigns appear here for the whole organization. Ask an admin to share a campaign, or create your own."
              : effectiveView === CAMPAIGN_LIST_VIEW_ALL_ACTIVITY
                ? "When teammates use shared campaigns, their runs show up here."
                : "A campaign ties your product setup to a contact list — qualify companies, score contacts, and write emails in one workspace."
          }
          actions={
            canCreate && effectiveView === CAMPAIGN_LIST_VIEW_MY ? (
              <Link
                href="/campaigns/new"
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                New campaign
              </Link>
            ) : !canCreate && effectiveView === CAMPAIGN_LIST_VIEW_MY ? (
              <Link
                href="/products/new"
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                New product
              </Link>
            ) : null
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
                <th className="px-4 py-3 font-medium">
                  {effectiveView === CAMPAIGN_LIST_VIEW_ALL_ACTIVITY
                    ? "Activity"
                    : "Contacts"}
                </th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => {
                const useShared = shouldUseSharedCampaign({
                  userId: user.id,
                  campaign,
                });
                return (
                  <tr key={campaign.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {useShared &&
                      effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL ? (
                        <span>{campaign.name}</span>
                      ) : (
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {campaign.name}
                        </Link>
                      )}
                      {campaign.visibility === "SHARED" ? (
                        <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                          Shared
                        </span>
                      ) : null}
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
                      {effectiveView === CAMPAIGN_LIST_VIEW_ALL_ACTIVITY ? (
                        <div className="space-y-1">
                          <p>
                            {campaign._count.executions ??
                              campaign.executions?.length ??
                              0}{" "}
                            run
                            {(campaign._count.executions ??
                              campaign.executions?.length ??
                              0) === 1
                              ? ""
                              : "s"}
                          </p>
                          {(campaign.executions ?? []).slice(0, 3).map((ex) => (
                            <p key={ex.id} className="text-xs text-slate-500">
                              {(ex.user?.name || ex.user?.email || "Member") +
                                ` · ${formatDate(ex.createdAt)}`}
                            </p>
                          ))}
                        </div>
                      ) : (
                        campaign._count.contacts
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(campaign.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {useShared &&
                      effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL &&
                      !campaign.archivedAt ? (
                        <form action={useSharedCampaignAction}>
                          <input
                            type="hidden"
                            name="campaignId"
                            value={campaign.id}
                          />
                          <button
                            type="submit"
                            className={cn(PRIMARY_BUTTON_CLASS, "!px-3 !py-1.5")}
                          >
                            Use this campaign
                          </button>
                        </form>
                      ) : useShared ? null : (
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
