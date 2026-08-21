import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getCurrentUser, resolveActiveOrganization } from "@/lib/auth/session";
import {
  buildSidebarNavItems,
  buildUserMenuModel,
  type MembershipRoleForMenu,
} from "@/lib/auth/user-menu";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const organization = user ? await getCurrentOrganization() : null;
  const membershipCtx =
    user && organization
      ? await resolveActiveOrganization(user)
      : null;

  const menuModel = user
    ? buildUserMenuModel({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        platformRole: user.platformRole,
        organizationName: organization?.name ?? null,
        membershipRole:
          (membershipCtx?.membership.role as MembershipRoleForMenu | undefined) ??
          null,
      })
    : null;

  const sidebarItems = buildSidebarNavItems({
    hasOrganization: Boolean(organization),
    isSuperAdmin: user?.platformRole === "SUPER_ADMIN",
  });

  return (
    <div className="flex min-h-screen bg-white text-slate-900">
      <Sidebar items={sidebarItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar menuModel={menuModel} />
        <main className="flex-1 overflow-auto bg-slate-50/60 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
