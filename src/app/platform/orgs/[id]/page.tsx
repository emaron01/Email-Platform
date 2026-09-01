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
import { computeCostReport } from "@/lib/platform/cost";
import {
  billingPlanLabel,
  billingStatusLabel,
} from "@/lib/billing/billing-state";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import {
  grantOrganizationCreditAction,
  platformChangeMemberRoleAction,
  platformInviteUserAction,
  platformRemoveMemberAction,
  platformRevokeInvitationAction,
  suspendOrganizationAction,
  unsuspendOrganizationAction,
  updatePlatformUsagePolicyAction,
  updatePlatformResearchPolicyAction,
} from "@/app/actions/platform-orgs";

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
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

  const cost = await computeCostReport({ organizationId: id, window: "30d" });
  const canMutate = canMutatePlatform(user.platformRole);
  const { organization: org, usage, health, usagePolicy, researchPolicy, billing } = detail;

  return (
    <div className="space-y-8">
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
            {org.accountType} · {org.status}
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
        <h2 className="text-lg font-medium">Billing</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Plan: {billingPlanLabel(billing.planCode)}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Status: {billingStatusLabel(billing.billingStatus)}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3 sm:col-span-2">
            Ops contact:{" "}
            {billing.billingEmail ?? "— (no address/tax stored)"}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500 sm:col-span-2">
            Stripe customer: {billing.stripeCustomerId ?? "—"} · subscription:{" "}
            {billing.stripeSubscriptionId ?? "—"} (Phase C)
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Cost (30d)</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Estimated spend: {formatUsd(cost.estimatedSpendUsd)}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3">
            Cost / company: {formatUsd(cost.costPerCompanyUsd)}
          </li>
          <li className="rounded-md border border-slate-200 bg-white p-3">
            <Link href="/platform/costs" className="font-medium underline">
              Full costs report
            </Link>
          </li>
        </ul>
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

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Members</h2>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-sm">
          {detail.members.map((m) => (
            <li
              key={m.membershipId}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span>
                {m.user.email} · {m.role}
                {m.isBillingContact ? " · billing contact" : ""}
              </span>
              {canMutate && m.role !== "OWNER" ? (
                <div className="flex flex-wrap gap-2">
                  <ActionFeedbackForm
                    action={platformChangeMemberRoleAction}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="organizationId" value={id} />
                    <input
                      type="hidden"
                      name="targetUserId"
                      value={m.user.id}
                    />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      Save role
                    </button>
                  </ActionFeedbackForm>
                  <ActionFeedbackForm action={platformRemoveMemberAction}>
                    <input type="hidden" name="organizationId" value={id} />
                    <input
                      type="hidden"
                      name="targetUserId"
                      value={m.user.id}
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-800"
                    >
                      Remove
                    </button>
                  </ActionFeedbackForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {canMutate ? (
          <ActionFeedbackForm
            action={platformInviteUserAction}
            className="grid gap-2 sm:grid-cols-3"
            testId="platform-invite-user-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <input
              name="email"
              type="email"
              required
              placeholder="user@company.com"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              name="role"
              defaultValue="MEMBER"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              Invite user
            </button>
          </ActionFeedbackForm>
        ) : null}

        {detail.pendingInvitations.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-800">
              Pending invitations
            </h3>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-sm">
              {detail.pendingInvitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    {inv.email} · {inv.role} · expires{" "}
                    {inv.expiresAt.toISOString().slice(0, 10)}
                  </span>
                  {canMutate ? (
                    <ActionFeedbackForm action={platformRevokeInvitationAction}>
                      <input type="hidden" name="organizationId" value={id} />
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        Revoke
                      </button>
                    </ActionFeedbackForm>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-medium">
            Products ({detail.products.length})
          </h2>
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
          <h2 className="text-lg font-medium">
            Campaigns ({detail.campaigns.length})
          </h2>
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

          <ActionFeedbackForm
            action={updatePlatformResearchPolicyAction}
            className="max-w-md space-y-3"
            testId="platform-research-policy-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <h3 className="text-sm font-medium text-slate-900">
              Contact research
            </h3>
            <p className="text-sm text-slate-600">
              Per-contact AI research during email generation. Carries real
              per-contact cost — platform operator only. Customers cannot enable
              this in organization settings.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="contactResearchEnabled"
                defaultChecked={researchPolicy?.contactResearchEnabled ?? false}
                className="mt-1"
              />
              <span>
                Enable contact research for this organization
              </span>
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              Save research policy
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
          Read-only SUPPORT view — mutations require SUPER_ADMIN.
        </p>
      )}
    </div>
  );
}
