import { AppShell } from "@/components/AppShell";

/**
 * Platform admin routes share the authenticated shell so platform operators
 * (SUPER_ADMIN / SUPPORT, including platform-only with no Organization)
 * always have Logout / Account. Email templates remain SUPER_ADMIN-only.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
