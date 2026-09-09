/**
 * Remove Better Auth rows for an identity so the email can be reused on signup.
 * Node-safe (no server-only).
 */
import { prisma } from "@/lib/prisma-client";

export async function purgeAuthIdentity(input: {
  authUserId: string;
  emails: string[];
}): Promise<void> {
  const identifiers = [
    ...new Set(
      [input.authUserId, ...input.emails.map((e) => e.trim().toLowerCase())].filter(
        Boolean,
      ),
    ),
  ];

  await prisma.$transaction([
    prisma.authSession.deleteMany({ where: { userId: input.authUserId } }),
    prisma.authAccount.deleteMany({ where: { userId: input.authUserId } }),
    prisma.authVerification.deleteMany({
      where: { identifier: { in: identifiers } },
    }),
    prisma.authUser.delete({ where: { id: input.authUserId } }),
  ]);
}

/**
 * After an organization hard-delete, remove tenant Users who no longer belong
 * to any workspace (and their auth identity). Platform operators are kept.
 */
export async function purgeOrphanedTenantUsersAfterOrgDelete(
  userIds: string[],
): Promise<{ purgedUserIds: string[] }> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const purgedUserIds: string[] = [];

  for (const userId of uniqueIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        authUserId: true,
        email: true,
        emailNormalized: true,
        platformRole: true,
        _count: { select: { memberships: true } },
      },
    });
    if (!user) continue;
    if (user.platformRole !== "NONE") continue;
    if (user._count.memberships > 0) continue;

    if (user.authUserId) {
      await purgeAuthIdentity({
        authUserId: user.authUserId,
        emails: [user.email, user.emailNormalized],
      });
    }

    await prisma.user.delete({ where: { id: user.id } });
    purgedUserIds.push(user.id);
  }

  return { purgedUserIds };
}
