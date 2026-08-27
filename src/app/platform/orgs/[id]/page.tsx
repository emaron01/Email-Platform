import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requirePlatformOperator,
  canMutatePlatform,
} from "@/lib/auth/authz";
import {
  getOrganizationPlatformDetail,
  recordPlatformOrgView,
} from "@/lib/platform/orgs";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import {
  grantOrganizationCreditAction,
  suspendOrganizationAction,
  unsuspendOrganizationAction,
  updatePlatformUsagePolicyAction,
} from "@/app/actions/platform-orgs";

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePlatformOperator();
  const { id } = await params;
  const detail = await getOrganizationPlatformDetail(id);
  if (!detail) notFound();

  await recordPlatformOrgView({
    actorUserId: user.id,
    organizationId: id,
    surface: "detail",
  });

  const canMutate = canMutatePlatform(user.platformRole);
  const { organization: org, usage, health, usagePolicy } = detail;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/platform/orgs" className="underline">
              Organizations
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {org.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {org.status}
            {org.suspendedAt
              ? ` · suspended ${org.suspendedAt.toISOString().slice(0, 10)}`
              : ""}
            {org.suspendedReason ? ` · ${org.suspendedReason}` : ""}
          </p>
        </div>
        <Link
          href={`/platform/orgs/${id}/view`}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
        >
          Scoped customer view
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Billing contact</h2>
        <p className="text-sm text-slate-700">
          {detail.billingEmail ?? "— (ops email only; no address/tax stored)"}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Usage</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Researched companies: {usage.researchedCompaniesUsed}
            {usage.researchedCompaniesLimit != null
              ? ` / ${usage.researchedCompaniesLimit}`
              : ""}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Email gens (today): {usage.today.emailGenerations}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Research ops (7d): {usage.last7d.researchOperations}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Email gens (30d): {usage.last30d.emailGenerations}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Health (failure rates)</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="font-medium">Last 7 days</p>
            <p>
              Research: {pct(health.last7d.research.failureRate)} (
              {health.last7d.research.failed}/{health.last7d.research.total})
            </p>
            <p>
              Email generation:{" "}
              {pct(health.last7d.emailGeneration.failureRate)} (
              {health.last7d.emailGeneration.failed}/
              {health.last7d.emailGeneration.total})
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="font-medium">Last 30 days</p>
            <p>
              Research: {pct(health.last30d.research.failureRate)} (
              {health.last30d.research.failed}/{health.last30d.research.total})
            </p>
            <p>
              Email generation:{" "}
              {pct(health.last30d.emailGeneration.failureRate)} (
              {health.last30d.emailGeneration.failed}/
              {health.last30d.emailGeneration.total})
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Setup completeness</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-4">
          {(
            [
              ["Product", detail.products.length > 0],
              ["ICP", detail.icps.length > 0],
              ["Persona", detail.personas.length > 0],
              ["List", detail.contactLists.length > 0],
            ] as const
          ).map(([label, ok]) => (
            <li
              key={label}
              className="rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              {label}: {ok ? "present" : "missing"}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Members</h2>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-sm">
          {detail.members.map((m) => (
            <li key={m.membershipId} className="px-3 py-2">
              {m.user.email} · {m.role}
              {m.isBillingContact ? " · billing contact" : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-medium">Products ({detail.products.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {detail.products.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {detail.products.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium">Campaigns ({detail.campaigns.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {detail.campaigns.map((c) => (
              <li key={c.id}>
                {c.name} · {c.status}
              </li>
            ))}
            {detail.campaigns.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium">ICPs ({detail.icps.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {detail.icps.map((i) => (
              <li key={i.id}>{i.name}</li>
            ))}
            {detail.icps.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium">
            Personas ({detail.personas.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {detail.personas.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {detail.personas.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : null}
          </ul>
        </div>
        <div className="sm:col-span-2">
          <h2 className="text-lg font-medium">
            Lists ({detail.contactLists.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {detail.contactLists.map((list) => (
              <li key={list.id}>
                {list.name}
                {list.totalContacts != null
                  ? ` · ${list.totalContacts} contacts`
                  : ""}
              </li>
            ))}
            {detail.contactLists.length === 0 ? (
              <li className="text-slate-500">None</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Credit grants</h2>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-sm">
          {detail.creditGrants.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">None yet.</li>
          ) : (
            detail.creditGrants.map((g) => (
              <li key={g.id} className="px-3 py-2">
                ${String(g.amountUsd)} · {g.reason} · by {g.grantedBy.email} ·{" "}
                {g.createdAt.toISOString().slice(0, 10)}
              </li>
            ))
          )}
        </ul>
      </section>

      {canMutate ? (
        <section className="space-y-6 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-medium">SUPER_ADMIN actions</h2>

          <ActionFeedbackForm
            action={updatePlatformUsagePolicyAction}
            className="grid max-w-md gap-3"
            testId="platform-usage-policy-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <label className="block text-sm">
              Active researched company limit
              <input
                name="activeResearchedCompanyLimit"
                type="number"
                min={0}
                defaultValue={
                  usagePolicy?.activeResearchedCompanyLimit ?? 100
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Daily AI email generation limit
              <input
                name="dailyEmailGenerationLimit"
                type="number"
                min={0}
                defaultValue={usagePolicy?.dailyEmailGenerationLimit ?? 500}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Daily send advisory threshold
              <input
                name="dailyEmailSendWarningLimit"
                type="number"
                min={0}
                defaultValue={usagePolicy?.dailyEmailSendWarningLimit ?? 150}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              Save usage policy
            </button>
          </ActionFeedbackForm>

          {org.status === "SUSPENDED" ? (
            <ActionFeedbackForm
              action={unsuspendOrganizationAction}
              className="flex items-center gap-3"
              testId="platform-unsuspend-form"
            >
              <input type="hidden" name="organizationId" value={id} />
              <button
                type="submit"
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
              >
                Unsuspend organization
              </button>
            </ActionFeedbackForm>
          ) : (
            <ActionFeedbackForm
              action={suspendOrganizationAction}
              className="grid max-w-md gap-3"
              testId="platform-suspend-form"
            >
              <input type="hidden" name="organizationId" value={id} />
              <label className="block text-sm">
                Suspension reason
                <input
                  name="reason"
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white"
              >
                Suspend organization
              </button>
            </ActionFeedbackForm>
          )}

          <ActionFeedbackForm
            action={grantOrganizationCreditAction}
            className="grid max-w-md gap-3"
            testId="platform-credit-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <label className="block text-sm">
              Amount (USD)
              <input
                name="amountUsd"
                type="number"
                min={0.01}
                step="0.01"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Reason
              <input
                name="reason"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Note (optional)
              <input
                name="note"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              Grant credit
            </button>
          </ActionFeedbackForm>
        </section>
      ) : (
        <p className="text-sm text-slate-500">
          Read-only SUPPORT view — policy, suspend, and credit actions require
          SUPER_ADMIN.
        </p>
      )}
    </div>
  );
}
