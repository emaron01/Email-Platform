"use server";

import type {
  QualificationBucket,
  QualificationOverrideTarget,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

export type QualificationOverrideActionResult = {
  ok: boolean;
  message: string;
  bucket?: QualificationBucket;
};

const BUCKETS: QualificationBucket[] = [
  "GOOD",
  "NEEDS_REVIEW",
  "POOR_FIT",
  "EXCLUDED",
];
const TARGETS: QualificationOverrideTarget[] = ["COMPANY", "CONTACT"];

export async function overrideQualificationBucketAction(input: {
  campaignId: string;
  scoringRunId: string;
  targetType: QualificationOverrideTarget;
  targetId: string;
  bucket: QualificationBucket;
}): Promise<QualificationOverrideActionResult> {
  if (!BUCKETS.includes(input.bucket) || !TARGETS.includes(input.targetType)) {
    return { ok: false, message: "Select a valid qualification bucket." };
  }
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    const run = await prisma.scoringRun.findFirst({
      where: { id: input.scoringRunId, organizationId: organization.id },
      select: { id: true },
    });
    if (!run) {
      return { ok: false, message: "Qualification run was not found." };
    }
    const targetExists =
      input.targetType === "CONTACT"
        ? await prisma.contactScore.count({
            where: {
              organizationId: organization.id,
              scoringRunId: run.id,
              contactId: input.targetId,
            },
          })
        : await prisma.contactScore.count({
            where: {
              organizationId: organization.id,
              scoringRunId: run.id,
              contact: { companyId: input.targetId },
            },
          });
    if (targetExists === 0) {
      return {
        ok: false,
        message: "Qualification row does not belong to this workspace.",
      };
    }
    await prisma.qualificationBucketOverride.upsert({
      where: {
        organizationId_scoringRunId_targetType_targetId: {
          organizationId: organization.id,
          scoringRunId: run.id,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      create: {
        organizationId: organization.id,
        scoringRunId: run.id,
        targetType: input.targetType,
        targetId: input.targetId,
        bucket: input.bucket,
        overriddenById: user.id,
      },
      update: {
        bucket: input.bucket,
        overriddenById: user.id,
      },
    });
    revalidatePath(`/campaigns/${input.campaignId}`);
    return {
      ok: true,
      message: `Moved to ${input.bucket.toLowerCase().replace("_", " ")}.`,
      bucket: input.bucket,
    };
  } catch (error) {
    console.error("Failed to override qualification bucket.", error);
    return {
      ok: false,
      message: "The qualification override could not be saved.",
    };
  }
}
