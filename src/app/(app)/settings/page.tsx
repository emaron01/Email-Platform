import Link from "next/link";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import {
  getMembershipForCurrentUser,
  canManageOrganizationPolicy,
} from "@/lib/org/authz";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";

export default async function SettingsIndexPage() {
  const organization = await requireOrganization();
  await ensureOrganizationPolicies(organization.id);
  const { membership } = await getMembershipForCurrentUser(organization.id);
  const isAdmin = canManageOrganizationPolicy(membership.role);

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
          <li>
            <Link
              href="/settings/organization"
              className="font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              Organization
            </Link>
            <p className="text-slate-600">
              Rename workspace, timezone, policies, invitations.
            </p>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
