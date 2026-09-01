import "server-only";

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { assertUsageAllowed } from "@/lib/usage/quota";

export async function commitLookaheadDraftQuota(input: {
  emailDraftId: string;
  userId: string;
}): Promise<{ committed: boolean; message?: string }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;

  const draft = await prisma.emailDraft.findFirst({
    where: { id: input.emailDraftId, organizationId },
    select: {
      id: true,
      source: true,
      generationQuotaCommitted: true,
      subject: true,
      body: true,
    },
  });
  if (!draft?.subject || !draft.body) {
    return { committed: false };
  }
  if (draft.generationQuotaCommitted) {
    return { committed: false };
  }
  if (draft.source !== "AI_LOOKAHEAD") {
    return { committed: false };
  }

  await assertUsageAllowed({
    organizationId,
    userId: input.userId,
    resource: "EMAIL_GENERATION",
  });

  await prisma.emailDraft.update({
    where: { id: draft.id },
    data: { generationQuotaCommitted: true },
  });

  return { committed: true };
}
