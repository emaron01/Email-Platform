import Link from "next/link";
import { requirePlatformOperator, canMutatePlatform } from "@/lib/auth/authz";
import { listOrganizationsForPlatform } from "@/lib/platform/orgs";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export default async function PlatformOrgsPage() {
  const user = await requirePlatformOperator();
  const orgs = await listOrganizationsForPlatform({ actorUserId: user.id });
  const canMutate = canMutatePlatform(user.platformRole);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform organizations
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {canMutate
              ? "SUPER_ADMIN — full platform ops (policy, suspend, credits)."
              : "SUPPORT — scoped read-only view. Mutations require SUPER_ADMIN."}
          </p>
        </div>
        {canMutate ? (
          <Link
            href="/platform/email-templates"
            className="text-sm font-medium text-slate-700 underline"
          >
            Email templates
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Members</th>
              <th className="px-3 py-2 font-medium">Products</th>
              <th className="px-3 py-2 font-medium">Campaigns</th>
              <th className="px-3 py-2 font-medium">Companies</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr
                key={org.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/platform/orgs/${org.id}`}
                    className="font-medium text-slate-900 underline"
                  >
                    {org.name}
                  </Link>
                  <div className="text-xs text-slate-500">{org.slug}</div>
                </td>
                <td className="px-3 py-2">{org.status}</td>
                <td className="px-3 py-2">{org.memberCount}</td>
                <td className="px-3 py-2">{org.productCount}</td>
                <td className="px-3 py-2">{org.campaignCount}</td>
                <td className="px-3 py-2">
                  {org.researchedCompaniesUsed}
                  {org.researchedCompaniesLimit != null
                    ? ` / ${org.researchedCompaniesLimit}`
                    : ""}
                </td>
                <td className="px-3 py-2">{formatDate(org.createdAt)}</td>
                <td className="px-3 py-2">{formatDate(org.lastActiveAt)}</td>
              </tr>
            ))}
            {orgs.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No organizations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
