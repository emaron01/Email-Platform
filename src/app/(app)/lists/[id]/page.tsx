import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveContactListAction,
  deleteContactListAction,
  unarchiveContactListAction,
} from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { SuppressContactForm } from "@/components/SuppressContactForm";
import { UnarchiveForm } from "@/components/UnarchiveForm";
import {
  EmptyState,
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import {
  getContactList,
  getContactListContacts,
  listIcps,
  listPersonas,
  listProducts,
  listScoringRunsForList,
} from "@/lib/tenant/data";
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
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import {
  contactDisplayName,
  formatDate,
  formatNumber,
} from "@/lib/utils";

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

  const [{ contacts, total, pageSize }, scoringRuns, products, icps, personas] =
    await Promise.all([
      getContactListContacts(id, { page, pageSize: 50 }),
      listScoringRunsForList(id),
      listProducts(),
      listIcps(),
      listPersonas(),
    ]);
  const [impact, suppressedEmails] = await Promise.all([
    getListLifecycleImpact(organization.id, id),
    listActiveNormalizedEmails(
      organization.id,
      contacts.map((contact) => contact.email),
    ),
  ]);
  const deleteDecision = decideListDelete(impact);
  const listArchived = list.archivedAt != null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
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
          This list is archived and read-only. Unarchive it to score or attach
          it to a campaign.
        </div>
      ) : null}

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

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts in this list"
          description="This list exists but has no contact records."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Industry</th>
                  <th className="px-4 py-3 font-medium">Employees</th>
                  <th className="px-4 py-3 font-medium">Revenue</th>
                  <th className="px-4 py-3 font-medium">Suppression</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {contactDisplayName(contact.firstName, contact.lastName)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.email ? (
                        <>
                          {contact.email}
                          {contactMatchesSuppressionSet(
                            contact.email,
                            suppressedEmails,
                          ) ? (
                            <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                              Opted out
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                          title="No email address — cannot be emailed, scored, or suppressed."
                        >
                          No email — unusable
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.title ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.company ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.industry ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatNumber(contact.employeeCount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.revenue != null
                        ? formatNumber(Number(contact.revenue))
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {contact.email ? (
                        <SuppressContactForm
                          contactId={contact.id}
                          email={contact.email}
                          suppressed={contactMatchesSuppressionSet(
                            contact.email,
                            suppressedEmails,
                          )}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>
                Page {page} of {totalPages}
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
