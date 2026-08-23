/**
 * Voice sample capture: readiness copy, user scoping, min length, ownership, usage.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { TenantError } from "@/lib/tenant/errors";
import {
  VOICE_SAMPLE_MIN_CHARS,
  VOICE_SAMPLE_READY_MAX,
  VOICE_SAMPLE_READY_MIN,
  voiceReadiness,
} from "@/lib/voice/types";

config({ path: ".env.local" });
config();

const SAMPLE_TEXT = "Hi Alex — ".repeat(20); // well over 100 chars of sent-email text

describe("voiceReadiness", () => {
  it("treats zero samples as optional, not ready", () => {
    const result = voiceReadiness(0);
    expect(result.ready).toBe(false);
    expect(result.count).toBe(0);
    expect(result.message).toMatch(/optional/i);
  });

  it(`is not ready below ${VOICE_SAMPLE_READY_MIN} samples`, () => {
    const result = voiceReadiness(VOICE_SAMPLE_READY_MIN - 1);
    expect(result.ready).toBe(false);
    expect(result.message).toContain(
      `${VOICE_SAMPLE_READY_MIN - 1} of ${VOICE_SAMPLE_READY_MIN}`,
    );
  });

  it(`is ready at ${VOICE_SAMPLE_READY_MIN} samples`, () => {
    expect(voiceReadiness(VOICE_SAMPLE_READY_MIN).ready).toBe(true);
  });

  it(`notes extras above ${VOICE_SAMPLE_READY_MAX}`, () => {
    const result = voiceReadiness(VOICE_SAMPLE_READY_MAX + 1);
    expect(result.ready).toBe(true);
    expect(result.message).toMatch(/enough/i);
  });
});

describe("voice capture seams", () => {
  it("lives on account settings, not a new route or generation path", () => {
    const account = readFileSync("src/app/(app)/settings/account/page.tsx", "utf8");
    const settings = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
    const form = readFileSync("src/components/VoiceSamplesForm.tsx", "utf8");
    const actions = readFileSync("src/app/actions/voice.ts", "utf8");

    expect(account).toContain("VoiceSamplesForm");
    expect(account).toContain("listVoiceSamplesForUser");
    expect(settings).toMatch(/writing voice/i);
    expect(form).toContain("saveVoiceSampleAction");
    expect(form).toContain("deleteVoiceSampleAction");
    expect(form).toContain("voice-action-status");
    expect(form).toContain("useActionState");
    expect(form).not.toMatch(/generate|openai|getAiConfig|EMAIL_AI/i);
    expect(actions).toContain("export async function saveVoiceSampleAction");
    expect(actions).toContain("export async function getVoiceSamplesAction");
    expect(actions).toContain("export async function deleteVoiceSampleAction");
    expect(actions).toContain("Promise<VoiceActionResult>");
    expect(actions).not.toMatch(/Campaign|EmailDraft|getAiConfig/);
  });

  it("requires 100 characters in the capture field", () => {
    const form = readFileSync("src/components/VoiceSamplesForm.tsx", "utf8");
    expect(form).toContain(`minLength={${VOICE_SAMPLE_MIN_CHARS}}`);
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "voice sample persistence",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    const orgIds: string[] = [];

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "sampleText" FROM "VoiceSample" LIMIT 0`;
        ready = true;
      } catch {
        console.warn(
          "Skipping voice sample DB tests: apply pending Prisma migrations first.",
        );
      }
    });

    afterAll(async () => {
      for (const id of orgIds) {
        await prisma.organization.delete({ where: { id } }).catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    it("rejects samples under 100 characters", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const { createVoiceSample } = await import("@/lib/voice/samples");
      const { organization, user } = await createIndividualWorkspace({
        email: `voice-short-${suffix}@example.test`,
        name: "Short Voice",
      });
      orgIds.push(organization.id);

      await expect(
        createVoiceSample({
          organizationId: organization.id,
          userId: user.id,
          label: "Too short",
          sampleText: "Hi there, this is not long enough.",
        }),
      ).rejects.toBeInstanceOf(TenantError);
    });

    it("keeps samples user-scoped in the same org and writes UsageEvent", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const {
        createVoiceSample,
        deleteVoiceSampleForUser,
        listVoiceSamplesForUser,
      } = await import("@/lib/voice/samples");

      const { organization, user: userA } = await createIndividualWorkspace({
        email: `voice-a-${suffix}@example.test`,
        name: "Voice A",
      });
      orgIds.push(organization.id);

      const userB = await prisma.user.create({
        data: {
          email: `voice-b-${suffix}@example.test`,
          emailNormalized: `voice-b-${suffix}@example.test`,
          name: "Voice B",
        },
      });
      await prisma.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: userB.id,
          role: "MEMBER",
        },
      });

      const created = await createVoiceSample({
        organizationId: organization.id,
        userId: userA.id,
        label: "Cold intro",
        sampleText: SAMPLE_TEXT,
      });
      expect(created.id).toBeTruthy();
      expect(created.sampleText).toBe(SAMPLE_TEXT.trim());
      expect(created.provenance).toBe("PASTED");

      const forA = await listVoiceSamplesForUser({
        organizationId: organization.id,
        userId: userA.id,
      });
      const forB = await listVoiceSamplesForUser({
        organizationId: organization.id,
        userId: userB.id,
      });
      expect(forA.map((row) => row.id)).toEqual([created.id]);
      expect(forB).toEqual([]);

      const event = await prisma.usageEvent.findFirstOrThrow({
        where: {
          organizationId: organization.id,
          userId: userA.id,
          operation: "VOICE_SAMPLE_SAVED",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(event.category).toBe("EMAIL_GENERATION");
      expect(event.status).toBe("SUCCESS");
      expect(JSON.stringify(event.metadata)).toContain(created.id);
      expect(JSON.stringify(event.metadata)).not.toContain(SAMPLE_TEXT.slice(0, 40));

      await expect(
        deleteVoiceSampleForUser({
          organizationId: organization.id,
          userId: userB.id,
          voiceSampleId: created.id,
        }),
      ).rejects.toBeInstanceOf(TenantError);

      const stillThere = await prisma.voiceSample.findUnique({
        where: { id: created.id },
      });
      expect(stillThere).not.toBeNull();

      await deleteVoiceSampleForUser({
        organizationId: organization.id,
        userId: userA.id,
        voiceSampleId: created.id,
      });
      expect(
        await prisma.voiceSample.findUnique({ where: { id: created.id } }),
      ).toBeNull();
    });

    it("rejects create when the user is not a member of the organization", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const { createVoiceSample } = await import("@/lib/voice/samples");
      const { organization } = await createIndividualWorkspace({
        email: `voice-org-${suffix}@example.test`,
        name: "Voice Org",
      });
      orgIds.push(organization.id);
      const stranger = await prisma.user.create({
        data: {
          email: `voice-stranger-${suffix}@example.test`,
          emailNormalized: `voice-stranger-${suffix}@example.test`,
          name: "Stranger",
        },
      });

      await expect(
        createVoiceSample({
          organizationId: organization.id,
          userId: stranger.id,
          label: "Should fail",
          sampleText: SAMPLE_TEXT,
        }),
      ).rejects.toBeInstanceOf(TenantError);
    });
  },
);
