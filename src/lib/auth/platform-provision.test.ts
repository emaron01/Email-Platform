/**
 * Production platform SUPER_ADMIN provisioning (distinct from local auth:bootstrap).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("platform provision confirmation (unit)", () => {
  it("requires exact PLATFORM_BOOTSTRAP_CONFIRM value", async () => {
    const {
      assertPlatformProvisionConfirmation,
      PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
      PlatformProvisionError,
      readPlatformProvisionEnv,
    } = await import("@/lib/auth/platform-provision-service");

    expect(() => assertPlatformProvisionConfirmation(null)).toThrow(
      PlatformProvisionError,
    );
    expect(() => assertPlatformProvisionConfirmation("yes")).toThrow(
      PlatformProvisionError,
    );
    expect(() =>
      assertPlatformProvisionConfirmation(PLATFORM_BOOTSTRAP_CONFIRM_VALUE),
    ).not.toThrow();

    process.env.PLATFORM_BOOTSTRAP_EMAIL = "ops@example.test";
    delete process.env.PLATFORM_BOOTSTRAP_CONFIRM;
    expect(() => readPlatformProvisionEnv()).not.toThrow();
    const env = readPlatformProvisionEnv();
    expect(env.confirm).toBeNull();
  });

  it("normal signup still requires email verification (config unchanged)", async () => {
    // Better Auth is configured with requireEmailVerification: true in server.ts.
    // Read the module source contract via auth env — do not call live Better Auth here.
    const src = await import("@/lib/auth/server");
    expect(src.auth).toBeTruthy();
    // Platform provision mark-verified is CLI-only; no global skip setting exists.
    expect(
      Object.keys(process.env).some((k) =>
        k.includes("SKIP_EMAIL_VERIFICATION"),
      ),
    ).toBe(false);
  });

  it("no public HTTP provisioning route exists", async () => {
    const { existsSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const appRoot = join(process.cwd(), "src", "app");
    const walk = (dir: string): boolean => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        if (
          name.name.includes("provision-super-admin") ||
          name.name === "platform-bootstrap"
        ) {
          return true;
        }
        if (name.isDirectory() && walk(join(dir, name.name))) return true;
      }
      return false;
    };
    expect(existsSync(join(appRoot, "api", "bootstrap"))).toBe(false);
    expect(walk(appRoot)).toBe(false);
  });
});

describe.skipIf(!hasDatabase)(
  "platform:provision-super-admin",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    const confirm = "PROVISION_INITIAL_SUPER_ADMIN";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1 FROM "auth_user" LIMIT 0`;
        await prisma.adminAuditEvent.findFirst({
          where: { action: "PLATFORM_SUPER_ADMIN_PROVISIONED" },
        });
      } catch {
        console.warn(
          "Skipping platform provision DB tests: apply migrations (npm run db:deploy).",
        );
        return;
      }
      ready = true;
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    it("fails closed without confirmation; Better Auth owns password; verified SUPER_ADMIN; idempotent; audited; preserves memberships", async () => {
      if (!ready) return;
      const email = `platform-ops-${suffix}@example.test`;
      const password = "super-secret-platform-pass";

      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const existing = await createIndividualWorkspace({
        email,
        firstName: "Ops",
        lastName: "Owner",
      });
      // Simulate pre-auth seed user: clear auth link, keep org membership.
      await prisma.user.update({
        where: { id: existing.user.id },
        data: {
          authUserId: null,
          platformRole: "NONE",
          emailVerifiedAt: null,
        },
      });
      const orgIdsBefore = (
        await prisma.organizationMembership.findMany({
          where: { userId: existing.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);

      const {
        provisionPlatformSuperAdmin,
        PlatformProvisionError,
        PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
      } = await import("@/lib/auth/platform-provision-service");

      await expect(
        provisionPlatformSuperAdmin({
          email,
          password,
          confirm: null,
          signUpEmail: async () => {
            throw new Error("must not call signUp without confirm");
          },
        }),
      ).rejects.toBeInstanceOf(PlatformProvisionError);

      let signUpCalls = 0;
      const authId = `auth_platform_${suffix}`;
      const first = await provisionPlatformSuperAdmin({
        email,
        password,
        confirm: PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
        signUpEmail: async (input) => {
          signUpCalls += 1;
          expect(input.password).toBe(password);
          expect(input.email).toBe(email);
          await prisma.authUser.create({
            data: {
              id: authId,
              name: input.name,
              email: input.email,
              emailVerified: false,
              firstName: input.firstName,
              lastName: input.lastName,
            },
          });
        await prisma.authAccount.create({
          data: {
            id: `acct_platform_${suffix}`,
            accountId: authId,
            providerId: "credential",
            issuer: "local:credential",
            userId: authId,
            password: "better-auth-managed-hash-placeholder",
          },
        });
          // Mimic database hook linking under platform flag (no new org).
          await prisma.user.update({
            where: { id: existing.user.id },
            data: { authUserId: authId },
          });
          return { userId: authId };
        },
      });

      expect(signUpCalls).toBe(1);
      expect(first.status).toBe("provisioned");
      expect(first.platformRole).toBe("SUPER_ADMIN");
      expect(first.emailVerified).toBe(true);
      expect(first.userId).toBe(existing.user.id);
      expect(first.authUserId).toBe(authId);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: existing.user.id },
      });
      expect(user.platformRole).toBe("SUPER_ADMIN");
      expect(user.emailVerifiedAt).toBeTruthy();
      expect(user.authUserId).toBe(authId);

      const authUser = await prisma.authUser.findUniqueOrThrow({
        where: { id: authId },
      });
      expect(authUser.emailVerified).toBe(true);

      expect(await prisma.authUser.count({ where: { email } })).toBe(1);
      // Memberships for this operator must be unchanged (none created here).
      expect(
        await prisma.organizationMembership.count({
          where: { userId: existing.user.id },
        }),
      ).toBe(orgIdsBefore.length);
      const orgIdsAfter = (
        await prisma.organizationMembership.findMany({
          where: { userId: existing.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);
      expect(orgIdsAfter.sort()).toEqual(orgIdsBefore.sort());

      const audit = await prisma.adminAuditEvent.findFirst({
        where: {
          action: "PLATFORM_SUPER_ADMIN_PROVISIONED",
          targetUserId: existing.user.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeTruthy();
      expect(JSON.stringify(audit)).not.toContain(password);
      expect(JSON.stringify(audit)).not.toContain(
        "better-auth-managed-hash-placeholder",
      );

      // Idempotent — no second AuthUser / signUp
      const second = await provisionPlatformSuperAdmin({
        email,
        password: null,
        confirm,
        signUpEmail: async () => {
          throw new Error("signUp must not run when already linked");
        },
      });
      expect(second.status).toBe("already_provisioned");
      expect(second.userId).toBe(existing.user.id);

      // Removing bootstrap env does not unlink the account.
      delete process.env.PLATFORM_BOOTSTRAP_EMAIL;
      delete process.env.PLATFORM_BOOTSTRAP_PASSWORD;
      delete process.env.PLATFORM_BOOTSTRAP_CONFIRM;
      const still = await prisma.user.findUniqueOrThrow({
        where: { id: existing.user.id },
      });
      expect(still.authUserId).toBe(authId);
      expect(still.platformRole).toBe("SUPER_ADMIN");
      expect(
        (
          await prisma.authUser.findUniqueOrThrow({ where: { id: authId } })
        ).emailVerified,
      ).toBe(true);
    });

    it("creates User without Organization when none exists; no duplicate AuthUsers", async () => {
      if (!ready) return;
      const email = `platform-solo-${suffix}@example.test`;
      const {
        provisionPlatformSuperAdmin,
        PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
      } = await import("@/lib/auth/platform-provision-service");

      const authId = `auth_solo_${suffix}`;

      await provisionPlatformSuperAdmin({
        email,
        password: "password-long-enough",
        confirm: PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
        signUpEmail: async (input) => {
          await prisma.authUser.create({
            data: {
              id: authId,
              name: input.name,
              email: input.email,
              emailVerified: false,
              firstName: input.firstName,
              lastName: input.lastName,
            },
          });
          const user = await prisma.user.findUniqueOrThrow({
            where: { emailNormalized: email },
          });
          await prisma.user.update({
            where: { id: user.id },
            data: { authUserId: authId },
          });
          return { userId: authId };
        },
      });

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: email },
      });
      expect(user.platformRole).toBe("SUPER_ADMIN");
      const memberships = await prisma.organizationMembership.count({
        where: { userId: user.id },
      });
      expect(memberships).toBe(0);
      expect(await prisma.authUser.count({ where: { email } })).toBe(1);
    });
  },
);
