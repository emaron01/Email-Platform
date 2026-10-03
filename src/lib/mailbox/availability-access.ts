import "server-only";

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { planAllowsMicrosoft365Sending } from "@/lib/billing/plans";
import {
  isMicrosoft365SendingAvailable,
  MICROSOFT_365_SENDING_UNAVAILABLE_MESSAGE,
} from "@/lib/mailbox/availability";

export type Microsoft365SendingAccess = {
  planCode: string | null;
  enabled: boolean;
  planEligible: boolean;
  available: boolean;
};

export async function getMicrosoft365SendingAccess(
  organizationId: string,
): Promise<Microsoft365SendingAccess> {
  const profile = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
    select: {
      planCode: true,
      microsoft365SendingEnabled: true,
    },
  });
  const planCode = profile?.planCode ?? null;
  const enabled = profile?.microsoft365SendingEnabled ?? false;
  const planEligible = planAllowsMicrosoft365Sending(planCode);
  return {
    planCode,
    enabled,
    planEligible,
    available: isMicrosoft365SendingAvailable({ planCode, enabled }),
  };
}

export async function assertMicrosoft365SendingAvailable(
  organizationId: string,
): Promise<void> {
  const access = await getMicrosoft365SendingAccess(organizationId);
  if (!access.available) {
    throw new TenantError(MICROSOFT_365_SENDING_UNAVAILABLE_MESSAGE);
  }
}
