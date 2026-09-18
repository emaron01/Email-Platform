/**
 * Redirect users who have not accepted the current published EULA.
 * /platform is not gated here (separate layout). Checkout exempts the EULA page.
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  userHasPriorEulaAcceptance,
  userNeedsEulaAcceptance,
} from "@/lib/legal/eula";
import { ONBOARDING_EULA_PATH } from "@/lib/billing/paths";

function isEulaExemptPage(pathname: string): boolean {
  return (
    pathname === ONBOARDING_EULA_PATH ||
    pathname.startsWith(`${ONBOARDING_EULA_PATH}/`) ||
    pathname === "/support" ||
    pathname.startsWith("/support/")
  );
}

export async function enforceEulaAcceptanceGate(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const pathname = (await headers()).get("x-pathname")?.trim() || "";
  if (pathname && isEulaExemptPage(pathname)) return;

  const status = await userNeedsEulaAcceptance(user.id);
  if (!status.needs) return;

  const prior = await userHasPriorEulaAcceptance(user.id);
  if (prior) {
    redirect(`${ONBOARDING_EULA_PATH}?updated=1`);
  }
  redirect(ONBOARDING_EULA_PATH);
}
