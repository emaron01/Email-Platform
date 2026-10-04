import Link from "next/link";
import { CampaignSummaryCard } from "@/components/CampaignSummaryCard";
import { DeleteSuccessNotice } from "@/components/DeleteSuccessNotice";
import { SharedCampaignActions } from "@/components/SharedCampaignActions";
import { EmptyState, PageHeader, PRIMARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  CAMPAIGN_LIST_VIEW_MY,
  CAMPAIGN_LIST_VIEW_SHARED_ALL,
  canViewAllCampaigns,
  parseCampaignListViewMode,
  shouldUseSharedCampaign,
} from "@/lib/campaign/visibility";
import { planShowsAllOrgCampaigns } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { cn } from "@/lib/utils";
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

  const [user, membershipCtx, billing] = await Promise.all([
    requireCurrentUser(),
    getMembershipForCurrentUser(organization.id),
    prisma.organizationBillingProfile.findUnique({
      where: { organizationId: organization.id },
      select: { planCode: true },
    }),
  ]);
  const canManageCampaigns = canViewAllCampaigns(
    membershipCtx.membership.role,
  );
  const showAllOrgCampaigns = planShowsAllOrgCampaigns(billing?.planCode);
  const effectiveView = showAllOrgCampaigns ? view : CAMPAIGN_LIST_VIEW_MY;

  const workflow = await getHomeWorkflow(organization.id, {
    includeArchived,
    userId: user.id,
    canViewAllRepWork: canManageCampaigns,
    listView: effectiveView,
  });
  const campaigns = workflow.campaigns;

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
        {[
          { id: CAMPAIGN_LIST_VIEW_MY, label: "My Campaigns" },
          {
            id: CAMPAIGN_LIST_VIEW_SHARED_ALL,
            label: canManageCampaigns
              ? "All org campaigns"
              : "All Campaigns",
          },
        ]
          .filter(
            (tab) =>
              showAllOrgCampaigns || tab.id === CAMPAIGN_LIST_VIEW_MY,
          )
          .map((tab) => (
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
              ? canManageCampaigns
                ? "No campaigns in this organization"
                : "No shared campaigns"
              : "No campaigns yet"
          }
          description={
            effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL
              ? canManageCampaigns
                ? "Every campaign owned by a member of this organization appears here."
                : "Shared campaigns appear here for the whole organization. Ask an admin to share a campaign, or create your own."
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
        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((campaign) => {
            const useShared =
              !canManageCampaigns &&
              shouldUseSharedCampaign({
                userId: user.id,
                campaign,
              });
            const showOwner =
              effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL &&
              canManageCampaigns;
            return (
              <CampaignSummaryCard
                key={campaign.id}
                campaign={campaign}
                linkName={
                  !(
                    useShared &&
                    effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL
                  )
                }
                ownerLabel={showOwner ? campaign.ownerLabel : null}
                actions={
                  useShared &&
                  effectiveView === CAMPAIGN_LIST_VIEW_SHARED_ALL &&
                  !campaign.archived ? (
                    <SharedCampaignActions campaignId={campaign.id} />
                  ) : useShared ? null : (
                    <Link
                      href={`/campaigns/${campaign.id}?stage=setup`}
                      className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
                    >
                      Edit campaign / offer details
                    </Link>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
