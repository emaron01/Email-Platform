import { AppShell } from "@/components/AppShell";
import { PlatformConsoleNav } from "@/components/PlatformConsoleNav";
import { requirePlatformOperator } from "@/lib/auth/authz";

/**
 * Platform admin routes share the authenticated shell and persistent console nav.
 * Email templates remain SUPER_ADMIN-only at the page gate.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePlatformOperator();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <PlatformConsoleNav platformRole={user.platformRole} />
        {children}
      </div>
    </AppShell>
  );
}
