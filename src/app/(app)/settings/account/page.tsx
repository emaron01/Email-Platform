import { requireCurrentUser } from "@/lib/auth/authz";
import { isEmailVerified } from "@/lib/auth/account-policy";
import { logoutAction, changePasswordAction } from "@/app/actions/account";
import Link from "next/link";

export default async function AccountSettingsPage() {
  const user = await requireCurrentUser();
  const verified = isEmailVerified(user);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link href="/settings" className="text-sm text-slate-600 hover:text-slate-900">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Account
        </h1>
      </div>

      <section className="space-y-2 text-sm">
        <p>
          <span className="text-slate-500">Name:</span>{" "}
          {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.name ||
            "—"}
        </p>
        <p>
          <span className="text-slate-500">Email:</span> {user.email}
        </p>
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
        <form action={changePasswordAction} className="space-y-3">
          <label className="block text-sm">
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            New password
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Update password
          </button>
        </form>
      </section>

      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
