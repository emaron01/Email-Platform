import { PageHeader } from "@/components/ui";
import { NoWorkspaceState } from "@/components/NoWorkspaceState";
import { requireCurrentUser } from "@/lib/auth/authz";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

/**
 * Production-safe account state when the signed-in user has no workspace.
 */
export default async function NoWorkspacePage() {
  const user = await requireCurrentUser();
  const organization = await getCurrentOrganization();

  if (organization) {
    redirect("/");
  }
  if (user.platformRole === "SUPER_ADMIN") {
    redirect("/settings/account");
  }

  return (
    <div>
      <PageHeader
        title="No workspace"
        description="This account is not linked to a customer workspace."
      />
      <NoWorkspaceState />
    </div>
  );
}
