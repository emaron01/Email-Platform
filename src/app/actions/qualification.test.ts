import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  savedBucket: null as string | null,
  upsert: vi.fn(
    async (input: {
      create: { bucket: string };
      update: { bucket: string };
    }) => {
      state.savedBucket = state.savedBucket
        ? input.update.bucket
        : input.create.bucket;
      return { bucket: state.savedBucket };
    },
  ),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: async () => ({ id: "user_1" }),
}));
vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  requireOrganization: async () => ({ id: "org_1" }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    scoringRun: {
      findFirst: async () => ({ id: "run_1" }),
    },
    contactScore: {
      count: async () => 1,
    },
    qualificationBucketOverride: {
      upsert: state.upsert,
    },
  },
}));

import { overrideQualificationBucketAction } from "@/app/actions/qualification";

describe("manual qualification bucket override", () => {
  beforeEach(() => {
    state.savedBucket = null;
    state.upsert.mockClear();
  });

  it("persists the latest manual bucket for the same qualification row", async () => {
    const input = {
      campaignId: "campaign_1",
      scoringRunId: "run_1",
      targetType: "CONTACT" as const,
      targetId: "contact_1",
    };
    expect(
      await overrideQualificationBucketAction({ ...input, bucket: "GOOD" }),
    ).toMatchObject({ ok: true, bucket: "GOOD" });
    expect(
      await overrideQualificationBucketAction({
        ...input,
        bucket: "EXCLUDED",
      }),
    ).toMatchObject({ ok: true, bucket: "EXCLUDED" });
    expect(state.savedBucket).toBe("EXCLUDED");
    expect(state.upsert).toHaveBeenCalledTimes(2);
  });
});
