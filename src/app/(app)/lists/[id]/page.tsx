import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveContactListAction,
  deleteContactListAction,
  unarchiveContactListAction,
} from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { ListCompanyResearchView } from "@/components/ListCompanyResearchView";
import { ResearchRunPanel } from "@/components/ResearchRunPanel";
import { UnarchiveForm } from "@/components/UnarchiveForm";
import {
  EmptyState,
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import { isResearchAiConfigured } from "@/lib/ai/config";
import { getMembershipForCurrentUser } from "@/lib/org/authz";
import {
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
import { formatDate, formatNumber } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function ListDetailPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { id } = await params;
  const query = await searchParams;
  const page = Number.parseInt(query.page ?? "1", 10) || 1;

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
                <Link
                  href={`/lists/${id}/score`}
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Score List
                </Link>
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
              hiddenFields={{ id: list.id }}
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
              onSuccessNavigate="/lists"
            />
            <Link
              href="/lists"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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

      <div className="mb-6">
        <Panel
          title="Company Research"
          description="Research runs once per unique company on this list. Results appear below grouped by company — qualification scoring stays on the score report."
        >
          <ResearchRunPanel
            contactListId={id}
            researchAiConfigured={isResearchAiConfigured()}
            allowance={researchAllowance}
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
                <Link href={`/lists/${id}/score`} className="underline">
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
                      {formatDate(run.createdAt)} · {run.product.name}
                    </p>
                    <p className="mt-1 text-slate-600">
                      ICP: {run.icp.name} · Persona:{" "}
                      {run.persona?.name ?? "All personas"} ·{" "}
                      {formatNumber(run.totalContacts)} contacts · {run.status}
                    </p>
                  </div>
                  <Link
                    href={`/scoring/${run.id}`}
                    className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                    href={`/lists/${id}?page=${page - 1}`}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={`/lists/${id}?page=${page + 1}`}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
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
