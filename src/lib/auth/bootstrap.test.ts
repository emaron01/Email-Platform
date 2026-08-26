/**
 * Auth bootstrap: link existing app User/Organization to Better Auth safely.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "auth bootstrap",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "authUserId" FROM "User" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "auth_user" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping bootstrap DB tests: apply pending migrations (npm run db:deploy).",
        );
        return;
      }
      ready = true;
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    it("fails closed in production without ALLOW_AUTH_BOOTSTRAP", async () => {
      const { assertBootstrapAllowed, BootstrapError } = await import(
        "@/lib/auth/bootstrap"
      );
      expect(() =>
        assertBootstrapAllowed({
          isProduction: true,
          allowInProduction: false,
        }),
      ).toThrow(BootstrapError);
      expect(() =>
        assertBootstrapAllowed({
          isProduction: true,
          allowInProduction: true,
        }),
      ).not.toThrow();
    });

    it("mismatched email fails safely without guessing", async () => {
      if (!ready) return;
      const { resolveBootstrapAppUser, BootstrapError } = await import(
        "@/lib/auth/bootstrap"
      );
      await expect(
        resolveBootstrapAppUser({
          email: `no-such-user-${suffix}@example.test`,
          existingUserId: null,
        }),
      ).rejects.toBeInstanceOf(BootstrapError);
    });

    it("ambiguous email vs userId matching fails safely", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const a = await createIndividualWorkspace({
        email: `boot-a-${suffix}@example.test`,
        name: "A",
      });
      const b = await createIndividualWorkspace({
        email: `boot-b-${suffix}@example.test`,
        name: "B",
      });
      // Unlink B so it could be a retarget candidate, but email matches A.
      await prisma.user.update({
        where: { id: b.user.id },
        data: { authUserId: null },
      });

      const { resolveBootstrapAppUser, BootstrapError } = await import(
        "@/lib/auth/bootstrap"
      );
      await expect(
        resolveBootstrapAppUser({
          email: a.user.emailNormalized,
          existingUserId: b.user.id,
        }),
      ).rejects.toThrow(/Ambiguous/);
      expect(BootstrapError).toBeTruthy();
    });

    it("links existing User, preserves Organization/membership/tenant data, idempotent", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const email = `boot-link-${suffix}@example.test`;
      const created = await createIndividualWorkspace({
        email,
        firstName: "Bootstrap",
        lastName: "Admin",
      });

      // Simulate pre-auth seed user: clear auth link, keep org + membership + product.
      await prisma.user.update({
        where: { id: created.user.id },
        data: { authUserId: null },
      });
      const product = await prisma.product.create({
        data: {
          organizationId: created.organization.id,
          name: `Bootstrap Product ${suffix}`,
        },
      });
      const orgIdsBefore = (
        await prisma.organizationMembership.findMany({
          where: { userId: created.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);
      const productCountBefore = await prisma.product.count({
        where: { organizationId: created.organization.id },
      });

      const fakeAuthId = `auth_boot_${suffix}`;
      const signUpEmail = async () => {
        await prisma.authUser.create({
          data: {
            id: fakeAuthId,
            name: "Bootstrap Admin",
            email,
            emailVerified: false,
            firstName: "Bootstrap",
            lastName: "Admin",
          },
        });
        // Mimic Better Auth password account existence without hashing ourselves.
        await prisma.authAccount.create({
          data: {
            id: `acct_${suffix}`,
            accountId: fakeAuthId,
            providerId: "credential",
            issuer: "local:credential",
            userId: fakeAuthId,
            password: "better-auth-managed-hash-placeholder",
          },
        });
        return { userId: fakeAuthId };
      };

      const { bootstrapAdminAccount } = await import("@/lib/auth/bootstrap");
      const first = await bootstrapAdminAccount({
        email,
        password: "password-long-enough",
        existingUserId: null,
        markEmailVerified: false,
        isProduction: false,
        signUpEmail,
      });

      expect(first.status).toBe("created_and_linked");
      expect(first.userId).toBe(created.user.id);
      expect(first.organizationId).toBe(created.organization.id);
      expect(first.organizationCountUnchanged).toBe(true);
      expect(["ADMIN", "OWNER"]).toContain(first.membershipRole);

      const linked = await prisma.user.findUniqueOrThrow({
        where: { id: created.user.id },
      });
      expect(linked.authUserId).toBe(fakeAuthId);
      expect(linked.activeOrganizationId).toBe(created.organization.id);

      const orgIdsAfter = (
        await prisma.organizationMembership.findMany({
          where: { userId: created.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);
      expect(orgIdsAfter.sort()).toEqual(orgIdsBefore.sort());
      const productCountAfter = await prisma.product.count({
        where: { organizationId: created.organization.id },
      });
      expect(productCountAfter).toBe(productCountBefore);
      expect(
        await prisma.product.findUnique({ where: { id: product.id } }),
      ).toBeTruthy();

      // Idempotent re-run
      const second = await bootstrapAdminAccount({
        email,
        password: null,
        existingUserId: null,
        markEmailVerified: false,
        isProduction: false,
        signUpEmail: async () => {
          throw new Error("signUpEmail must not be called when already linked");
        },
      });
      expect(second.status).toBe("already_linked");
      expect(second.organizationId).toBe(created.organization.id);
      const orgIdsFinal = (
        await prisma.organizationMembership.findMany({
          where: { userId: created.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);
      expect(orgIdsFinal.sort()).toEqual(orgIdsBefore.sort());
    });

    it("BOOTSTRAP_EXISTING_USER_ID retargets email then links without new Organization", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const original = await createIndividualWorkspace({
        email: `boot-old-${suffix}@example.test`,
        firstName: "Old",
        lastName: "Email",
      });
      await prisma.user.update({
        where: { id: original.user.id },
        data: { authUserId: null },
      });
      const orgIdsBefore = (
        await prisma.organizationMembership.findMany({
          where: { userId: original.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);
      const newEmail = `boot-new-${suffix}@example.test`;
      const authId = `auth_retarget_${suffix}`;

      const { bootstrapAdminAccount } = await import("@/lib/auth/bootstrap");
      const result = await bootstrapAdminAccount({
        email: newEmail,
        password: "password-long-enough",
        existingUserId: original.user.id,
        markEmailVerified: false,
        isProduction: false,
        signUpEmail: async () => {
          await prisma.authUser.create({
            data: {
              id: authId,
              name: "Old Email",
              email: newEmail,
              emailVerified: false,
              firstName: "Old",
              lastName: "Email",
            },
          });
          return { userId: authId };
        },
      });

      expect(result.organizationId).toBe(original.organization.id);
      const orgIdsAfter = (
        await prisma.organizationMembership.findMany({
          where: { userId: original.user.id },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);
      expect(orgIdsAfter.sort()).toEqual(orgIdsBefore.sort());
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: original.user.id },
      });
      expect(user.emailNormalized).toBe(newEmail);
      expect(user.authUserId).toBe(authId);
    });

    it("promotes MEMBER to ADMIN and sets activeOrganizationId", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const email = `boot-member-${suffix}@example.test`;
      const created = await createIndividualWorkspace({
        email,
        name: "Member",
      });
      await prisma.user.update({
        where: { id: created.user.id },
        data: { authUserId: null, activeOrganizationId: null },
      });
      await prisma.organizationMembership.updateMany({
        where: { userId: created.user.id },
        data: { role: "MEMBER" },
      });
      const authId = `auth_member_${suffix}`;
      const { bootstrapAdminAccount } = await import("@/lib/auth/bootstrap");
      const result = await bootstrapAdminAccount({
        email,
        password: "password-long-enough",
        existingUserId: null,
        markEmailVerified: false,
        isProduction: false,
        signUpEmail: async () => {
          await prisma.authUser.create({
            data: {
              id: authId,
              name: "Member",
              email,
              emailVerified: false,
            },
          });
          return { userId: authId };
        },
      });
      expect(result.membershipRole).toBe("ADMIN");
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: created.user.id },
      });
      expect(user.activeOrganizationId).toBe(created.organization.id);
    });

    it("SUPER_ADMIN assignment is separate, idempotent; arbitrary users stay NONE", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const target = await createIndividualWorkspace({
        email: `boot-sa-${suffix}@example.test`,
        name: "SA",
      });
      const other = await createIndividualWorkspace({
        email: `boot-other-${suffix}@example.test`,
        name: "Other",
      });
      await prisma.user.update({
        where: { id: target.user.id },
        data: { platformRole: "NONE" },
      });
      await prisma.user.update({
        where: { id: other.user.id },
        data: { platformRole: "NONE" },
      });

      const { bootstrapPlatformSuperAdmin } = await import(
        "@/lib/auth/bootstrap"
      );
      const first = await bootstrapPlatformSuperAdmin({
        email: target.user.email,
      });
      expect(first.status).toBe("granted");
      const second = await bootstrapPlatformSuperAdmin({
        email: target.user.email,
      });
      expect(second.status).toBe("already_super_admin");

      const otherAfter = await prisma.user.findUniqueOrThrow({
        where: { id: other.user.id },
      });
      expect(otherAfter.platformRole).toBe("NONE");
    });

    it("platform bootstrap refuses unlinked users", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const created = await createIndividualWorkspace({
        email: `boot-unlinked-sa-${suffix}@example.test`,
        name: "Unlinked",
      });
      await prisma.user.update({
        where: { id: created.user.id },
        data: { authUserId: null },
      });
      const { bootstrapPlatformSuperAdmin, BootstrapError } = await import(
        "@/lib/auth/bootstrap"
      );
      await expect(
        bootstrapPlatformSuperAdmin({ email: created.user.email }),
      ).rejects.toBeInstanceOf(BootstrapError);
    });

    it("mark verified is refused in production", async () => {
      if (!ready) return;
      const { bootstrapAdminAccount, BootstrapError } = await import(
        "@/lib/auth/bootstrap"
      );
      await expect(
        bootstrapAdminAccount({
          email: `x-${suffix}@example.test`,
          password: "password-long-enough",
          existingUserId: null,
          markEmailVerified: true,
          isProduction: true,
          signUpEmail: async () => ({ userId: "x" }),
        }),
      ).rejects.toBeInstanceOf(BootstrapError);
    });

    it("login resolution uses authUserId link; ADMIN authz works; no public bootstrap route", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const email = `boot-session-${suffix}@example.test`;
      const created = await createIndividualWorkspace({
        email,
        name: "Session",
      });
      const authId = created.user.authUserId!;
      const user = await prisma.user.findUniqueOrThrow({
        where: { authUserId: authId },
      });
      expect(user.id).toBe(created.user.id);

      const { resolveActiveOrganization } = await import("@/lib/auth/session");
      const ctx = await resolveActiveOrganization(user);
      expect(ctx?.organization.id).toBe(created.organization.id);
      expect(["ADMIN", "OWNER"]).toContain(ctx?.membership.role);

      const { canEditTransactionalTemplates } = await import(
        "@/lib/auth/authz"
      );
      expect(canEditTransactionalTemplates("NONE")).toBe(false);
      expect(canEditTransactionalTemplates("SUPER_ADMIN")).toBe(true);

      // No public HTTP bootstrap route in App Router.
      const { readdirSync, existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const appRoot = join(process.cwd(), "src", "app");
      expect(existsSync(join(appRoot, "bootstrap"))).toBe(false);
      expect(existsSync(join(appRoot, "api", "bootstrap"))).toBe(false);
      const walkHasBootstrap = (dir: string): boolean => {
        for (const name of readdirSync(dir, { withFileTypes: true })) {
          if (name.name === "bootstrap") return true;
          if (name.isDirectory()) {
            if (walkHasBootstrap(join(dir, name.name))) return true;
          }
        }
        return false;
      };
      expect(walkHasBootstrap(appRoot)).toBe(false);
    });

    it("password creation path uses injected Better Auth signUp (not manual hash writes)", async () => {
      if (!ready) return;
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const email = `boot-pwd-${suffix}@example.test`;
      const created = await createIndividualWorkspace({
        email,
        name: "Pwd",
      });
      await prisma.user.update({
        where: { id: created.user.id },
        data: { authUserId: null },
      });

      let called = false;
      const authId = `auth_pwd_${suffix}`;
      const { bootstrapAdminAccount } = await import("@/lib/auth/bootstrap");
      await bootstrapAdminAccount({
        email,
        password: "password-long-enough",
        existingUserId: null,
        markEmailVerified: false,
        isProduction: false,
        signUpEmail: async (input) => {
          called = true;
          expect(input.password).toBe("password-long-enough");
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
          return { userId: authId };
        },
      });
      expect(called).toBe(true);
    });

    it("production auth protections remain enabled (dev bypass fails closed)", async () => {
      const { getAuthEnv } = await import("@/lib/auth/config");
      const prevNode = process.env.NODE_ENV;
      const prevBypass = process.env.ALLOW_DEV_TENANT_BYPASS;
      const prevSecret = process.env.BETTER_AUTH_SECRET;
      try {
        Object.assign(process.env, {
          NODE_ENV: "production",
          ALLOW_DEV_TENANT_BYPASS: "true",
          BETTER_AUTH_SECRET: "x".repeat(40),
        });
        expect(() => getAuthEnv()).toThrow(/ALLOW_DEV_TENANT_BYPASS/);
      } finally {
        Object.assign(process.env, {
          NODE_ENV: prevNode,
          ALLOW_DEV_TENANT_BYPASS: prevBypass,
          BETTER_AUTH_SECRET: prevSecret,
        });
      }
    });
  },
);
