import "server-only";

import { prisma } from "@/lib/prisma";

export type MailboxConnectionView = {
  provider: "MICROSOFT_365";
  status: "CONNECTED" | "RECONNECT_REQUIRED";
  mailboxAddress: string;
  connectedAt: Date;
  lastErrorCode: string | null;
};

export async function getMailboxConnectionView(input: {
  organizationId: string;
  userId: string;
}): Promise<MailboxConnectionView | null> {
  return prisma.mailboxConnection.findUnique({
    where: {
      organizationId_userId_provider: {
        organizationId: input.organizationId,
        userId: input.userId,
        provider: "MICROSOFT_365",
      },
    },
    select: {
      provider: true,
      status: true,
      mailboxAddress: true,
      connectedAt: true,
      lastErrorCode: true,
    },
  });
}
