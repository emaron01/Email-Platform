import Link from "next/link";
import { headers } from "next/headers";
import {
  readDismissedPersonalBillingOrgIds,
} from "@/app/actions/workspace";
import { PersonalBillingNoticeBanner } from "@/components/billing/PersonalBillingNoticeBanner";
import { Sidebar } from "@/components/Sidebar";
import {
  getCampaignDetail,
  getCampaignQualificationView,
} from "@/lib/campaign/contacts";
import { TenantError } from "@/lib/tenant/errors";
import { deriveCampaignProgress } from "@/lib/workflow/campaign-progress";
import { resolveCampaignStage } from "@/lib/workflow/campaign-stages";
import { TopBar } from "@/components/TopBar";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getCurrentUser, resolveActiveOrganization } from "@/lib/auth/session";
import { isPlatformOperator } from "@/lib/auth/authz";
import {
  buildSidebarNavItems,
  buildUserMenuModel,
  type MembershipRoleForMenu,
} from "@/lib/auth/user-menu";
import { billingPlanLabel } from "@/lib/billing/billing-state";
import { planAllowsReferrals } from "@/lib/billing/plans";
import { isMicrosoft365SendingAvailable } from "@/lib/mailbox/availability";
import {
  listOwnedBilledOrganizationsAsideFrom,
  listWorkspacesForUser,
} from "@/lib/org/workspaces";
import { prisma } from "@/lib/prisma";

function campaignIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  if (!match || match[1] === "new") return null;
  return decodeURIComponent(match[1]);
}

async function campaignSidebarProgress() {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname")?.trim() || "";
  const campaignId = campaignIdFromPath(pathname);
  if (!campaignId) return null;
  const requested =
    new URLSearchParams(
      (headerList.get("x-search") ?? "").replace(/^\?/, ""),
    )
      .get("stage")
      ?.trim() || undefined;
  try {
    const [campaign, qualification] = await Promise.all([
      getCampaignDetail(campaignId),
      getCampaignQualificationView(campaignId),
    ]);
    const progress = deriveCampaignProgress({
      productId: campaign.productId,
      icpId: campaign.icpId,
      contacts: campaign.contacts,
      companyRows: qualification.companyRows,
      contactRows: qualification.contactRows,
    });
    return {
      campaignId,
      stages: progress.stages,
      currentStage: resolveCampaignStage(requested, progress.stages),
    };
  } catch (error) {
    if (error instanceof TenantError) return null;
    throw error;
  }
}

export async function AppShell({
  children,
  paymentLocked = false,
  pastDueReadOnly = false,
}: {
  children: React.ReactNode;
  paymentLocked?: boolean;
  /** PAST_DUE grace: views allowed, all writes blocked. */
  pastDueReadOnly?: boolean;
}) {
  const user = await getCurrentUser();
  const organization = user ? await getCurrentOrganization() : null;
  const membershipCtx =
    user && organization ? await resolveActiveOrganization(user) : null;

  const billingProfile = organization
    ? await prisma.organizationBillingProfile.findUnique({
        where: { organizationId: organization.id },
        select: { planCode: true, microsoft365SendingEnabled: true },
      })
    : null;
  const billingPlanCode = billingProfile?.planCode ?? null;
  const microsoft365SendingAvailable = isMicrosoft365SendingAvailable({
    planCode: billingPlanCode,
    enabled: billingProfile?.microsoft365SendingEnabled ?? false,
  });

  const workspaces = user
    ? await listWorkspacesForUser({
        userId: user.id,
        activeOrganizationId: user.activeOrganizationId,
      })
    : [];

  const menuModel = user
    ? buildUserMenuModel({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        platformRole: user.platformRole,
        organizationName: organization?.name ?? null,
        membershipRole:
          (membershipCtx?.membership.role as
            | MembershipRoleForMenu
            | undefined) ?? null,
        paymentLocked,
        workspaces: workspaces.map((w) => ({
          organizationId: w.organizationId,
          name: w.name,
          isActive: w.isActive,
        })),
      })
    : null;

  const sidebarItems = buildSidebarNavItems({
    hasOrganization: Boolean(organization),
    isPlatformOperator: user ? isPlatformOperator(user.platformRole) : false,
    paymentLocked,
    microsoft365SendingAvailable,
  });
  const campaignProgress = organization ? await campaignSidebarProgress() : null;

  let personalBillingNoticeOrgs: Array<{
    organizationId: string;
    name: string;
    planLabel: string;
  }> = [];
  if (user && organization) {
    const owned = await listOwnedBilledOrganizationsAsideFrom({
      userId: user.id,
      excludeOrganizationId: organization.id,
    });
    if (owned.length > 0) {
      const dismissed = await readDismissedPersonalBillingOrgIds();
      personalBillingNoticeOrgs = owned
        .filter((o) => !dismissed.has(o.organizationId))
        .map((o) => ({
          organizationId: o.organizationId,
          name: o.name,
          planLabel: billingPlanLabel(o.planCode),
        }));
    }
  }

  return (
    <div className="flex min-h-screen bg-white text-slate-900">
      <Sidebar items={sidebarItems} campaign={campaignProgress} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          menuModel={menuModel}
          showReferrals={planAllowsReferrals(billingPlanCode)}
        />
        {pastDueReadOnly && !paymentLocked ? (
          <div
            role="status"
            className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950"
            data-testid="past-due-readonly-banner"
          >
            <p>
              Payment is past due — your workspace is read-only. You can view
              everything, but you cannot change setup data or use research,
              email generation, or sending.{" "}
              <Link
                href="/settings/billing"
                className="font-medium underline underline-offset-2"
              >
                Update billing
              </Link>{" "}
              to restore access.
            </p>
          </div>
        ) : null}
        {personalBillingNoticeOrgs.length > 0 ? (
          <PersonalBillingNoticeBanner orgs={personalBillingNoticeOrgs} />
        ) : null}
        <main className="flex-1 overflow-auto bg-slate-50/60 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
