import "server-only";

/**
 * User-scoped voice sample capture. No AI. No generation.
 */

import type { VoiceSample } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  VOICE_SAMPLE_MIN_CHARS,
  type VoiceSampleView,
} from "@/lib/voice/types";

export {
  VOICE_SAMPLE_MIN_CHARS,
  VOICE_SAMPLE_READY_MAX,
  VOICE_SAMPLE_READY_MIN,
  voiceReadiness,
  type VoiceSampleView,
} from "@/lib/voice/types";

export function toVoiceSampleView(row: VoiceSample): VoiceSampleView {
  return {
    id: row.id,
    label: row.label,
    sampleText: row.sampleText,
    provenance: row.provenance,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listVoiceSamplesForUser(input: {
  organizationId: string;
  userId: string;
}): Promise<VoiceSampleView[]> {
  const rows = await prisma.voiceSample.findMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toVoiceSampleView);
}

export async function createVoiceSample(input: {
  organizationId: string;
  userId: string;
  label: string;
  sampleText: string;
}): Promise<VoiceSampleView> {
  const label = input.label.trim();
  const sampleText = input.sampleText.trim();
  if (!label) {
    throw new TenantError("Label is required.");
  }
  if (sampleText.length < VOICE_SAMPLE_MIN_CHARS) {
    throw new TenantError(
      `Sample must be at least ${VOICE_SAMPLE_MIN_CHARS} characters of sent email text.`,
    );
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new TenantError("You are not a member of this organization.");
  }

  const row = await prisma.voiceSample.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      label,
      sampleText,
      provenance: "PASTED",
      active: true,
    },
  });

  await recordUsageEvent({
    organizationId: input.organizationId,
    userId: input.userId,
    category: "EMAIL_GENERATION",
    operation: "VOICE_SAMPLE_SAVED",
    status: "SUCCESS",
    metadata: {
      voiceSampleId: row.id,
      labelLength: label.length,
      sampleChars: sampleText.length,
      provenance: "PASTED",
    },
  });

  return toVoiceSampleView(row);
}

export async function deleteVoiceSampleForUser(input: {
  organizationId: string;
  userId: string;
  voiceSampleId: string;
}): Promise<void> {
  const existing = await prisma.voiceSample.findFirst({
    where: {
      id: input.voiceSampleId,
      organizationId: input.organizationId,
      userId: input.userId,
    },
    select: { id: true },
  });
  if (!existing) {
    throw new TenantError("Voice sample not found for the current user.");
  }
  await prisma.voiceSample.delete({ where: { id: existing.id } });
}
