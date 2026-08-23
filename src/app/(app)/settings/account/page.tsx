import { requireCurrentUser } from "@/lib/auth/authz";
import { isEmailVerified } from "@/lib/auth/account-policy";
import { logoutAction } from "@/app/actions/account";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import Link from "next/link";

export default async function AccountSettingsPage() {
  const user = await requireCurrentUser();
  const organization = await getCurrentOrganization();
  const verified = isEmailVerified(user);
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.name ||
    null;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        {organization ? (
          <Link
            href="/settings"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Settings
          </Link>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Account Settings
        </h1>
      </div>

      <section className="space-y-2 text-sm">
        <p>
          <span className="text-slate-500">Name:</span> {displayName || "—"}
        </p>
        <p>
          <span className="text-slate-500">Email:</span> {user.email}
        </p>
        {user.platformRole === "SUPER_ADMIN" ? (
          <p>
            <span className="text-slate-500">Platform role:</span> SUPER_ADMIN
          </p>
        ) : null}
        {organization ? (
          <p>
            <span className="text-slate-500">Workspace:</span>{" "}
            {organization.name}
          </p>
        ) : null}
        <p>
          <span className="text-slate-500">Verification:</span>{" "}
          {verified ? (
            <span className="text-emerald-700">Verified</span>
          ) : (
            <span className="text-amber-700">
              Unverified —{" "}
              <Link href="/verify-email" className="underline">
                verify now
              </Link>
            </span>
          )}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Change password</h2>
        <ChangePasswordForm />
      </section>

      <form action={logoutAction}>
        <button
          type="submit"
          data-testid="account-log_out"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          Log Out
        </button>
      </form>
    </div>
  );
}
