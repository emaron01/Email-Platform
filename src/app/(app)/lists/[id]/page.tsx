import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveContactListAction,
  deleteContactListAction,
  unarchiveContactListAction,
} from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { CampaignListWorkflowButtons } from "@/components/CampaignListWorkflowButtons";
import { ListCompanyResearchView } from "@/components/ListCompanyResearchView";
import { ResearchRunPanel } from "@/components/ResearchRunPanel";
import { UnarchiveForm } from "@/components/UnarchiveForm";
import { EmptyState, PageHeader, Panel, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { isResearchAiConfigured } from "@/lib/ai/config";
import { loadResearchBillingContext } from "@/lib/billing/research-billing-context";
import { getMembershipForCurrentUser } from "@/lib/org/authz";
import {
  isContactListResearchComplete,
  listDetailHref,
  listIndexHref,
  listScoreHref,
  parseCampaignId,
} from "@/lib/lists/campaign-query";
import {
  getCampaignForListWorkflow,
  getContactList,
  listIcps,
  listPersonas,
  listProducts,
  listScoringRunsForList,
} from "@/lib/tenant/data";
import {
  getCompaniesNeedingResearchForContactList,
  getContactListCompanyGroups,
} from "@/lib/tenant/companies";
import {
  getActiveResearchRunForContactList,
  getLatestResearchRunForContactList,
} from "@/lib/research/runs";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import {
  decideListDelete,
  getListLifecycleImpact,
  listArchiveConfirmBody,
  listDeleteConfirmBody,
} from "@/lib/tenant/list-delete";
import { listActiveNormalizedEmails } from "@/lib/suppression/service";
import { getActiveResearchedCompanyUsage } from "@/lib/usage/quota";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; campaign?: string }>;
};

export default async function ListDetailPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { id } = await params;
  const query = await searchParams;
  const page = Number.parseInt(query.page ?? "1", 10) || 1;
  const campaignId = parseCampaignId(query.campaign);

  if (!organization) {
    return (
      <div>
        <PageHeader title="List" description="List detail" />
        <TenantMissing />
      </div>
    );
  }

  let list;
  try {
    list = await getContactList(id);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const membership = await getMembershipForCurrentUser(organization.id);
  const [
    companyGroups,
    researchPlan,
    scoringRuns,
    products,
    icps,
    personas,
    researchAllowance,
    researchBilling,
    activeResearchRun,
    latestResearchRun,
    campaign,
  ] = await Promise.all([
    getContactListCompanyGroups(id, { page, pageSize: 25 }),
    getCompaniesNeedingResearchForContactList(id),
    listScoringRunsForList(id),
    listProducts(),
    listIcps(),
    listPersonas(),
    getActiveResearchedCompanyUsage({
      organizationId: organization.id,
      userId: membership.user.id,
    }),
    loadResearchBillingContext(organization.id),
    getActiveResearchRunForContactList(id, organization.id),
    getLatestResearchRunForContactList(id, organization.id),
    campaignId ? getCampaignForListWorkflow(campaignId) : Promise.resolve(null),
  ]);

  const allEmails = companyGroups.groups.flatMap((group) =>
    group.contacts.map((contact) => contact.email),
  );
  const [impact, suppressedEmails] = await Promise.all([
    getListLifecycleImpact(organization.id, id),
    listActiveNormalizedEmails(organization.id, allEmails),
  ]);
  const deleteDecision = decideListDelete(impact);
  const listArchived = list.archivedAt != null;
  const researchComplete =
    isContactListResearchComplete(researchPlan) && !activeResearchRun;
  const scoreHref = listScoreHref(id, campaign?.id);
  const listsHref = listIndexHref({ campaignId: campaign?.id });

  const totalPages = Math.max(
    1,
    Math.ceil(companyGroups.totalCompanies / companyGroups.pageSize),
  );

  const readyProducts = products.filter((product) => {
    const hasIcp = icps.some((icp) => icp.productId === product.id);
    const hasPersona = personas.some((persona) => persona.productId === product.id);
    return hasIcp && hasPersona;
  });

  return (
    <div>
      <PageHeader
        title={list.name}
        description={`${list.sourceType}${
          list.originalFilename ? ` · ${list.originalFilename}` : ""
        } · ${formatNumber(list.totalContacts)} contacts · imported ${formatDate(list.createdAt)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {listArchived ? (
              <UnarchiveForm
                action={unarchiveContactListAction}
                id={list.id}
                label="Unarchive list"
              />
            ) : (
              <>
                {campaign ? (
                  <CampaignListWorkflowButtons
                    listId={id}
                    campaignId={campaign.id}
                    campaignName={campaign.name}
                    researchComplete={researchComplete}
                  />
                ) : (
                  <Link
                    href={scoreHref}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Score List
                  </Link>
                )}
                <ConfirmDeleteForm
                  action={archiveContactListAction}
                  hiddenFields={{ id: list.id }}
                  triggerLabel="Archive list"
                  confirmTitle={`Archive list "${list.name}"?`}
                  confirmBody={listArchiveConfirmBody()}
                  confirmButtonLabel="Archive list"
                  tone="warning"
                  pendingLabel="Archiving…"
                />
              </>
            )}
            <ConfirmDeleteForm
              action={deleteContactListAction}
              hiddenFields={{ id: list.id, redirectTo: listsHref }}
              triggerLabel="Delete list"
              confirmTitle={`Delete list "${list.name}"?`}
              confirmBody={listDeleteConfirmBody(deleteDecision)}
              confirmButtonLabel={
                deleteDecision.mode === "delete"
                  ? "Delete list"
                  : deleteDecision.mode === "archive"
                    ? "Archive list"
                    : "Cannot delete"
              }
              onSuccessNavigate={listsHref}
            />
            <Link
              href={listsHref}
              className={SECONDARY_BUTTON_CLASS}
            >
              Back to lists
            </Link>
          </div>
        }
      />

      {listArchived ? (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This list is archived and read-only. Unarchive it to score, research, or
          attach it to a campaign.
        </div>
      ) : null}

      <div id="company-research" className="mb-6">
        <Panel
          title="Company Research"
          description="Research runs once per unique company on this list. Results appear below grouped by company — qualification scoring stays on the score report."
        >
          <ResearchRunPanel
            contactListId={id}
            researchAiConfigured={isResearchAiConfigured()}
            allowance={researchAllowance}
            billing={researchBilling}
            initialActiveRun={activeResearchRun}
            initialLastRun={
              activeResearchRun ? null : latestResearchRun
            }
            plan={{
              totalContacts: researchPlan.totalContacts,
              uniqueCompanies: researchPlan.uniqueCompanies,
              alreadyResearched: researchPlan.alreadyResearched,
              needingResearch: researchPlan.needingResearch,
              statusCounts: researchPlan.statusCounts,
            }}
          />
        </Panel>
      </div>

      <div className="mb-6">
        <Panel
          title="Scoring History"
          description="The same list can be scored multiple times against different Product / ICP / Persona combinations."
        >
          {scoringRuns.length === 0 ? (
            <p className="text-sm text-slate-600">
              No scoring runs yet.{" "}
              {listArchived
                ? "Unarchive this list to score it."
                : readyProducts.length > 0 ? (
                <Link href={scoreHref} className="underline">
                  Score this list
                </Link>
              ) : (
                "Add a Product with an ICP and Persona in Setup first."
              )}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {scoringRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">
                      {run.label?.trim()
                        ? run.label
                        : `${formatDate(run.createdAt)} · ${run.product.name}`}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {run.label?.trim()
                        ? `${formatDate(run.createdAt)} · ${run.product.name} · `
                        : null}
                      ICP: {run.icp.name} · Persona:{" "}
                      {run.persona?.name ?? "All personas"} ·{" "}
                      {formatNumber(run.totalContacts)} contacts · {run.status}
                    </p>
                  </div>
                  <Link
                    href={`/scoring/${run.id}${campaign?.id ? `?campaign=${campaign.id}` : ""}`}
                    className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                  >
                    View Report
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {companyGroups.totalContacts === 0 ? (
        <EmptyState
          title="No contacts in this list"
          description="This list exists but has no contact records."
        />
      ) : (
        <>
          <ListCompanyResearchView
            groups={companyGroups.groups}
            contactListId={id}
            showIndustry={companyGroups.showIndustry}
            listArchived={listArchived}
            suppressedEmails={suppressedEmails}
          />

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>
                Companies {companyGroups.page} of {totalPages} ·{" "}
                {formatNumber(companyGroups.totalContacts)} contacts total
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={listDetailHref(id, {
                      campaignId: campaign?.id,
                      page: page - 1,
                    })}
                    className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={listDetailHref(id, {
                      campaignId: campaign?.id,
                      page: page + 1,
                    })}
                    className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
