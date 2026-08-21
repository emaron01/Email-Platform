import { AppShell } from "@/components/AppShell";

/**
 * Platform admin routes share the authenticated shell so SUPER_ADMIN
 * (including platform-only, no Organization) always has Logout / Account.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
