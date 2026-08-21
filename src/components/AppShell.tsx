import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getCurrentUser } from "@/lib/auth/session";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [organization, user] = await Promise.all([
    getCurrentOrganization(),
    getCurrentUser(),
  ]);

  return (
    <div className="flex min-h-screen bg-white text-slate-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          organizationName={organization?.name ?? "No organization selected"}
          userLabel={
            user
              ? user.email
              : organization
                ? "Dev session"
                : "Sign in required"
          }
        />
        <main className="flex-1 overflow-auto bg-slate-50/60 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
