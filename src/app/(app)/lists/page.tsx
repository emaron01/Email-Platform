import Link from "next/link";
import { AddContactsWizard } from "@/components/AddContactsWizard";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import {
  EmptyState,
  PageHeader,
  TenantMissing,
} from "@/components/ui";
import { listContactLists } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { formatDate, formatNumber } from "@/lib/utils";

export default async function ListsPage({
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
          title="Lists"
          description="Contact lists for this organization."
        />
        <TenantMissing />
      </div>
    );
  }

  const lists = await listContactLists({ includeArchived });

  return (
    <div>
      <PageHeader
        title="Lists"
        description="Create lists by pasting contacts or uploading CSV/XLSX files. All data stays in this organization."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ShowArchivedToggle
              href={includeArchived ? "/lists" : "/lists?archived=1"}
              includeArchived={includeArchived}
              label="lists"
            />
            <AddContactsWizard />
          </div>
        }
      />

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
                      href={`/lists/${list.id}`}
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
