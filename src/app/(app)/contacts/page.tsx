import {
  EmptyState,
  PageHeader,
  PrimaryButton,
  TenantMissing,
} from "@/components/ui";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { SuppressContactForm } from "@/components/SuppressContactForm";
import { listContactLists, listContacts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import {
  contactDisplayName,
  formatNumber,
} from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ listId?: string; q?: string; archived?: string }>;
};

export default async function ContactsPage({ searchParams }: PageProps) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Contacts"
          description="Contacts belonging to the active organization."
        />
        <TenantMissing />
      </div>
    );
  }

  const listId = query.listId?.trim() || undefined;
  const search = query.q?.trim() || undefined;
  const includeArchived = query.archived === "1";

  const [contacts, lists] = await Promise.all([
    listContacts({ listId, search }),
    listContactLists({ includeArchived }),
  ]);
  const suppressedEmails = await listActiveNormalizedEmails(
    organization.id,
    contacts.map((contact) => contact.email),
  );

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="All contacts for this organization. Filter by list or search name, email, company, or title."
        actions={
          <ShowArchivedToggle
            href={
              includeArchived
                ? `/contacts${listId || search ? `?${new URLSearchParams({ ...(listId ? { listId } : {}), ...(search ? { q: search } : {}) }).toString()}` : ""}`
                : `/contacts?${new URLSearchParams({
                    ...(listId ? { listId } : {}),
                    ...(search ? { q: search } : {}),
                    archived: "1",
                  }).toString()}`
            }
            includeArchived={includeArchived}
            label="lists"
          />
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">List</span>
          <select
            name="listId"
            defaultValue={listId ?? ""}
            className="mt-1 block min-w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All lists</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-64 flex-1 text-sm">
          <span className="font-medium text-slate-700">Search</span>
          <input
            name="q"
            defaultValue={search ?? ""}
            placeholder="Name, email, company, title"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <PrimaryButton type="submit">Apply</PrimaryButton>
        {includeArchived ? (
          <input type="hidden" name="archived" value="1" />
        ) : null}
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts found"
          description={
            search || listId
              ? "Try clearing filters or importing another list."
              : "Contacts will appear here after you import a list."
          }
        />
      ) : (
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
                <th className="px-4 py-3 font-medium">List</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Score Label</th>
                <th className="px-4 py-3 font-medium">Suppression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => {
                const latestScore = contact.scores[0];
                return (
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
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                          Missing
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
                      {contact.contactList?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {latestScore?.overallScore != null
                        ? latestScore.overallScore
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {latestScore?.scoreLabel ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <SuppressContactForm
                        contactId={contact.id}
                        email={contact.email}
                        suppressed={contactMatchesSuppressionSet(
                          contact.email,
                          suppressedEmails,
                        )}
                      />
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
