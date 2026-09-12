"use server";

import { revalidatePath } from "next/cache";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { ensureEulaSeeded } from "@/lib/legal/eula";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";

export type PlatformEulaActionResult = {
  ok: boolean;
  message: string;
};

function toSafeError(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to update EULA. Please try again.";
    }
    return error.message;
  }
  return "Unable to update EULA. Please try again.";
}

function revalidateEulaPaths(): void {
  revalidatePath("/platform/eula");
  revalidatePath("/onboarding/eula");
}

export async function createEulaDraftAction(
  _prev: PlatformEulaActionResult | null,
  formData: FormData,
): Promise<PlatformEulaActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    await ensureEulaSeeded(user.id);

    const content = String(formData.get("content") || "").trim();
    if (content.length < 40) {
      return {
        ok: false,
        message: "Draft content is too short.",
      };
    }

    const max = await prisma.eulaVersion.aggregate({
      _max: { versionNumber: true },
    });
    const versionNumber = (max._max.versionNumber ?? 0) + 1;

    await prisma.eulaVersion.create({
      data: {
        versionNumber,
        content,
        publishedAt: null,
        createdByUserId: user.id,
      },
    });

    revalidateEulaPaths();
    return {
      ok: true,
      message: `Draft version ${versionNumber} created. Publish it when ready.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function publishEulaVersionAction(
  _prev: PlatformEulaActionResult | null,
  formData: FormData,
): Promise<PlatformEulaActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const eulaVersionId = String(formData.get("eulaVersionId") || "").trim();
    if (!eulaVersionId) {
      return { ok: false, message: "Missing version id." };
    }

    const draft = await prisma.eulaVersion.findUnique({
      where: { id: eulaVersionId },
    });
    if (!draft) {
      return { ok: false, message: "Version not found." };
    }
    if (draft.publishedAt) {
      return {
        ok: false,
        message: "This version is already published. Create a new draft to change terms.",
      };
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.eulaVersion.updateMany({
        where: { publishedAt: { not: null } },
        data: { publishedAt: null },
      });
      await tx.eulaVersion.update({
        where: { id: eulaVersionId },
        data: { publishedAt: now },
      });
    });

    await recordAdminAuditEvent({
      action: "EULA_PUBLISHED",
      actorUserId: user.id,
      metadata: {
        eulaVersionId,
        versionNumber: draft.versionNumber,
      },
    });

    revalidateEulaPaths();
    return {
      ok: true,
      message: `Version ${draft.versionNumber} is now published. Users must re-accept on next visit.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}
