import "server-only";

import type { OrganizationCadencePolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_CADENCE_POLICY = {
  day2IntervalDays: 9,
  day3IntervalDays: 6,
  day4IntervalDays: 15,
  repeatIntervalDays: 30,
  maxSequenceEmails: 4,
} as const;

export type CadencePolicyValues = Pick<
  OrganizationCadencePolicy,
  | "day2IntervalDays"
  | "day3IntervalDays"
  | "day4IntervalDays"
  | "repeatIntervalDays"
  | "maxSequenceEmails"
>;

export async function ensureOrganizationCadencePolicy(
  organizationId: string,
): Promise<CadencePolicyValues> {
  const row = await prisma.organizationCadencePolicy.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      ...DEFAULT_CADENCE_POLICY,
    },
    select: {
      day2IntervalDays: true,
      day3IntervalDays: true,
      day4IntervalDays: true,
      repeatIntervalDays: true,
      maxSequenceEmails: true,
    },
  });
  return row;
}
