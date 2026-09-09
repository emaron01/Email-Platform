import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

/**
 * Minimal chrome for post-verify subscribe — no AppShell / checkout-gate.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCurrentUser();
  const organization = await getCurrentOrganization();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <p className="text-sm font-medium tracking-tight">
            {organization?.name ?? "Aim Outreach"}
          </p>
          <Link
            href="/settings/account"
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Account
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-10">{children}</main>
    </div>
  );
}
