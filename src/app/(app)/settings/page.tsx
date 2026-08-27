import Link from "next/link";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import {
  getMembershipForCurrentUser,
  canManageOrganizationPolicy,
} from "@/lib/org/authz";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";
import { listAiRoleStatuses } from "@/lib/ai/roles";
import { AiRoleStatusList } from "@/components/AiRoleStatusList";

export default async function SettingsIndexPage() {
  const organization = await requireOrganization();
  await ensureOrganizationPolicies(organization.id);
  const { membership } = await getMembershipForCurrentUser(organization.id);
  const isAdmin = canManageOrganizationPolicy(membership.role);
  const aiRoles = listAiRoleStatuses();
  const unconfigured = aiRoles.filter((role) => !role.configured);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Workspace configuration for {organization.name}.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          AI configuration
        </h2>
        <p className="text-sm text-slate-600">
          Each role has its own environment variables. An unset role no longer
          fails silently — scoring and other operations that need it will stop
          and say so.
        </p>
        {unconfigured.length > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {unconfigured.length} role
            {unconfigured.length === 1 ? " is" : "s are"} not configured:{" "}
            {unconfigured.map((role) => role.label).join(", ")}.
          </p>
        ) : (
          <p className="text-sm text-slate-700">All AI roles are configured.</p>
        )}
        <AiRoleStatusList roles={aiRoles} />
      </section>

      <ul className="space-y-3 text-sm">
        <li>
          <Link
            href="/settings/account"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Account
          </Link>
          <p className="text-slate-600">
            Profile, email verification, password, and logout.
          </p>
        </li>
        <li>
          <Link
            href="/settings/voice"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Your Voice
          </Link>
          <p className="text-slate-600">
            Writing samples used to style generated outbound emails.
          </p>
        </li>
        <li>
          <Link
            href="/settings/usage"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Usage & limits
          </Link>
          <p className="text-slate-600">
            Effective quotas, metering, and research depth.
          </p>
        </li>
        <li>
          <Link
            href="/settings/email"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Email connection
          </Link>
          <p className="text-slate-600">
            Connect your own Microsoft 365 mailbox for direct sending.
          </p>
        </li>
        {isAdmin ? (
          <>
            <li>
              <Link
                href="/settings/organization"
                className="font-medium text-slate-900 underline-offset-2 hover:underline"
              >
                Organization
              </Link>
              <p className="text-slate-600">
                Name, timezone, policies, members, and invitations.
              </p>
            </li>
            <li>
              <Link
                href="/settings/billing"
                className="font-medium text-slate-900 underline-offset-2 hover:underline"
              >
                Billing
              </Link>
              <p className="text-slate-600">
                Plan and status (free until Stripe). Payment management later.
              </p>
            </li>
            <li>
              <Link
                href="/settings/cadence"
                className="font-medium text-slate-900 underline-offset-2 hover:underline"
              >
                Email cadence
              </Link>
              <p className="text-slate-600">
                Follow-up intervals and max sequence length.
              </p>
            </li>
          </>
        ) : null}
      </ul>
    </div>
  );
}
