import { AppShell } from "@/components/AppShell";
import { enforceSelfServeCheckoutGate } from "@/lib/billing/checkout-gate";
import { enforceEulaAcceptanceGate } from "@/lib/legal/eula-gate";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceEulaAcceptanceGate();
  await enforceSelfServeCheckoutGate();
  return <AppShell>{children}</AppShell>;
}
