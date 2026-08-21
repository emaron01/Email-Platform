/**
 * Node-safe admin audit recording (no server-only).
 * Next.js entry: `@/lib/auth/audit` re-exports behind server-only.
 */
import type { AdminAuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recordAdminAuditEvent(input: {
  action: AdminAuditAction;
  actorUserId?: string | null;
  organizationId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const metadata = sanitizeAuditMetadata(input.metadata);
  await prisma.adminAuditEvent.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      organizationId: input.organizationId ?? null,
      targetUserId: input.targetUserId ?? null,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

const SECRETISH = /(password|token|secret|api[_-]?key|authorization|hash)/i;

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (SECRETISH.test(k)) continue;
    if (typeof v === "string" && (SECRETISH.test(v) || v.startsWith("sk-"))) {
      continue;
    }
    out[k] = v;
  }
  return out;
}
