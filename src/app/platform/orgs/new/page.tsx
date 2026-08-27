import Link from "next/link";
import { canMutatePlatform, requirePlatformOperator } from "@/lib/auth/authz";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { createPlatformOrganizationAction } from "@/app/actions/platform-orgs";

export default async function PlatformCreateOrgPage() {
  const user = await requirePlatformOperator();
  const canMutate = canMutatePlatform(user.platformRole);

  if (!canMutate) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-slate-600">
          SUPPORT can view organizations but cannot create accounts. Ask a
          SUPER_ADMIN.
        </p>
        <Link href="/platform/orgs" className="text-sm font-medium underline">
          Back to organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/platform/orgs" className="underline">
            Organizations
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Create account
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Creates a free organization and invites the first user as OWNER via
          the existing invitation email. No payment collection.
        </p>
      </div>

      <ActionFeedbackForm
        action={createPlatformOrganizationAction}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        testId="create-platform-org-form"
      >
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Organization name</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Acme Sales"
          />
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium text-slate-800">Account type</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="accountType"
              value="INDIVIDUAL"
              defaultChecked
              className="mt-1"
            />
            <span>
              <span className="font-medium">Individual</span> — one organization,
              first user is OWNER (starts as a single seat; may invite others
              later).
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="accountType"
              value="ENTERPRISE"
              className="mt-1"
            />
            <span>
              <span className="font-medium">Enterprise</span> — multi-user org;
              first user is OWNER and can invite teammates. Product / ICP /
              Personas are shared; voice and signature stay per user.
            </span>
          </label>
        </fieldset>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            First user email (OWNER)
          </span>
          <input
            name="ownerEmail"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="friend@example.com"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Create and send invite
        </button>
      </ActionFeedbackForm>
    </div>
  );
}
