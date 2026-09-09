import { AppShell } from "@/components/AppShell";
import { enforceSelfServeCheckoutGate } from "@/lib/billing/checkout-gate";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceSelfServeCheckoutGate();
  return <AppShell>{children}</AppShell>;
}
