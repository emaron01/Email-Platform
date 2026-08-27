import Link from "next/link";
import {
  updateOrganizationUsagePolicyAction,
  updateResearchPolicyAction,
  updateOrganizationTimezoneAction,
  upsertUserUsageOverrideAction,
  renameWorkspaceAction,
  inviteUserAction,
} from "@/app/actions/settings";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { requireOrgAdmin } from "@/lib/org/authz";
import { prisma } from "@/lib/prisma";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";

export default async function OrganizationSettingsPage() {
  const { organization, user } = await requireOrgAdmin();
  await ensureOrganizationPolicies(organization.id);

  const [usagePolicy, researchPolicy, members, overrides, invitations] =
    await Promise.all([
      prisma.organizationUsagePolicy.findUniqueOrThrow({
        where: { organizationId: organization.id },
      }),
      prisma.researchPolicy.findUniqueOrThrow({
        where: { organizationId: organization.id },
      }),
      prisma.organizationMembership.findMany({
        where: { organizationId: organization.id },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.userUsageOverride.findMany({
        where: { organizationId: organization.id },
      }),
      prisma.organizationInvitation.findMany({
        where: { organizationId: organization.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const overrideByUser = new Map(
    overrides.map((o) => [o.userId, o] as const),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <Link
          href="/settings"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Organization
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Admin settings for {organization.name}. Signed in as {user.email}.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Workspace name</h2>
        <ActionFeedbackForm
          action={renameWorkspaceAction}
          className="flex gap-2"
          testId="rename-workspace-form"
        >
          <input
            name="name"
            defaultValue={organization.name}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Save
          </button>
        </ActionFeedbackForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Timezone</h2>
        <p className="text-sm text-slate-600">
          Daily email quotas and the send advisory use this IANA timezone (not
          server UTC alone).
        </p>
        <ActionFeedbackForm
          action={updateOrganizationTimezoneAction}
          className="flex gap-2"
          testId="timezone-form"
        >
          <input
            name="timezone"
            defaultValue={organization.timezone}
            placeholder="America/New_York"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Save
          </button>
        </ActionFeedbackForm>
        <p className="text-sm">
          <Link href="/settings/cadence" className="font-medium underline">
            Email cadence settings
          </Link>{" "}
          — follow-up intervals and max sequence length.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Usage limits</h2>
        <p className="text-sm text-slate-600">
          Confirmed sends are advisory only — they leave from the rep&apos;s
          mailbox and protect domain reputation, not platform cost. AI email
          generation is a separate platform ceiling and does not count toward
          the send advisory.
        </p>
        <ActionFeedbackForm
          action={updateOrganizationUsagePolicyAction}
          className="grid gap-3 sm:grid-cols-2"
          testId="usage-policy-form"
        >
          <label className="text-sm">
            Active researched companies
            <input
              name="activeResearchedCompanyLimit"
              type="number"
              min={0}
              defaultValue={usagePolicy.activeResearchedCompanyLimit}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Daily AI email generations
            <input
              name="dailyEmailGenerationLimit"
              type="number"
              min={0}
              defaultValue={usagePolicy.dailyEmailGenerationLimit}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Daily send advisory threshold
            <input
              name="dailyEmailSendWarningLimit"
              type="number"
              min={0}
              defaultValue={usagePolicy.dailyEmailSendWarningLimit}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Warn after this many confirmed sends today. Never blocks sending.
            </span>
          </label>
          <button
            type="submit"
            className="sm:col-span-2 w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Save usage policy
          </button>
        </ActionFeedbackForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Research depth</h2>
        <ActionFeedbackForm
          action={updateResearchPolicyAction}
          className="grid gap-3 sm:grid-cols-3"
          testId="research-policy-form"
        >
          <label className="text-sm">
            Max searches / company
            <input
              name="maxSearchQueriesPerCompany"
              type="number"
              min={1}
              defaultValue={researchPolicy.maxSearchQueriesPerCompany}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Max sources / company
            <input
              name="maxSourcesPerCompany"
              type="number"
              min={0}
              defaultValue={researchPolicy.maxSourcesPerCompany}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Freshness (days)
            <input
              name="researchFreshnessDays"
              type="number"
              min={1}
              defaultValue={researchPolicy.researchFreshnessDays}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="sm:col-span-3 w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Save research policy
          </button>
        </ActionFeedbackForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">User overrides</h2>
        <p className="text-sm text-slate-600">
          Leave blank to inherit organization defaults. Members cannot raise their
          own limits.
        </p>
        <ul className="space-y-4">
          {members.map((m) => {
            const ov = overrideByUser.get(m.userId);
            return (
              <li
                key={m.id}
                className="rounded-md border border-slate-200 bg-white p-4"
              >
                <p className="text-sm font-medium text-slate-900">
                  {m.user.name ?? m.user.email}{" "}
                  <span className="font-normal text-slate-500">
                    ({m.role})
                  </span>
                </p>
                <ActionFeedbackForm
                  action={upsertUserUsageOverrideAction}
                  className="mt-3 grid gap-2 sm:grid-cols-4"
                  testId={`user-override-form-${m.userId}`}
                >
                  <input type="hidden" name="userId" value={m.userId} />
                  <label className="text-xs text-slate-600">
                    Active companies
                    <input
                      name="activeResearchedCompanyLimit"
                      type="number"
                      min={0}
                      defaultValue={ov?.activeResearchedCompanyLimit ?? ""}
                      placeholder="inherit"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Daily AI generations
                    <input
                      name="dailyEmailGenerationLimit"
                      type="number"
                      min={0}
                      defaultValue={ov?.dailyEmailGenerationLimit ?? ""}
                      placeholder="inherit"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Send advisory
                    <input
                      name="dailyEmailSendWarningLimit"
                      type="number"
                      min={0}
                      defaultValue={ov?.dailyEmailSendWarningLimit ?? ""}
                      placeholder="inherit"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    className="self-end rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    Save override
                  </button>
                </ActionFeedbackForm>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Invite user</h2>
        <ActionFeedbackForm
          action={inviteUserAction}
          className="grid gap-2 sm:grid-cols-3"
          testId="invite-user-form"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
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
            className="sm:col-span-3 w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Create invitation
          </button>
        </ActionFeedbackForm>
        {invitations.length > 0 ? (
          <ul className="text-sm text-slate-600">
            {invitations.map((inv) => (
              <li key={inv.id}>
                Pending: {inv.email} as {inv.role} (expires{" "}
                {inv.expiresAt.toISOString().slice(0, 10)})
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-slate-500">
          Production authentication is required before public signup/invite
          acceptance flows are exposed. Invitation tokens are hashed at rest.
        </p>
      </section>
    </div>
  );
}
