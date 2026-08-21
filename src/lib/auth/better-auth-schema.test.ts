/**
 * Better Auth 1.7 ↔ Prisma schema compatibility + live credential signup.
 * Fails if AuthAccount (or other core auth models) drift from installed Better Auth.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import { getAuthTables, createLocalAccountIssuer } from "@better-auth/core/db";
import {
  formatSafeErrorForLog,
  redactAuthErrorMessage,
} from "@/lib/auth/safe-error";

config({ path: ".env.local" });
config();

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

/** Map Better Auth logical table → our Prisma modelName. */
const MODEL_NAMES = {
  user: "authUser",
  session: "authSession",
  account: "authAccount",
  verification: "authVerification",
} as const;

describe("Better Auth schema ↔ Prisma compatibility", () => {
  it("installed Better Auth account schema requires issuer + unique(issuer, accountId)", () => {
    const tables = getAuthTables({});
    const account = tables.account;
    expect(account).toBeTruthy();
    expect(account.fields.issuer).toMatchObject({
      type: "string",
      required: true,
    });
    expect(account.fields.accountId).toMatchObject({
      type: "string",
      required: true,
    });
    expect(account.fields.providerId).toMatchObject({
      type: "string",
      required: true,
    });
    expect(account.fields.password).toMatchObject({
      type: "string",
      required: false,
    });

    const uniqueIssuerAccount = (account.indexes ?? []).some(
      (idx) =>
        idx.unique &&
        idx.fields.length === 2 &&
        idx.fields[0] === "issuer" &&
        idx.fields[1] === "accountId",
    );
    expect(uniqueIssuerAccount).toBe(true);
    expect(createLocalAccountIssuer("credential")).toBe("local:credential");
  });

  it("Prisma Auth* models include every Better Auth core field (incl. issuer)", () => {
    const tables = getAuthTables({
      user: { modelName: MODEL_NAMES.user },
      session: { modelName: MODEL_NAMES.session },
      account: { modelName: MODEL_NAMES.account },
      verification: { modelName: MODEL_NAMES.verification },
    });

    const dmmf = Prisma.dmmf.datamodel.models;
    const byName = new Map(dmmf.map((m) => [m.name, m]));

    const expectedPrisma = {
      user: "AuthUser",
      session: "AuthSession",
      account: "AuthAccount",
      verification: "AuthVerification",
    } as const;

    for (const [logical, prismaName] of Object.entries(expectedPrisma)) {
      const ba = tables[logical as keyof typeof tables];
      const model = byName.get(prismaName);
      expect(model, `missing Prisma model ${prismaName}`).toBeTruthy();
      const fieldNames = new Set(model!.fields.map((f) => f.name));
      expect(fieldNames.has("id")).toBe(true);
      for (const [fieldName, field] of Object.entries(ba.fields)) {
        // Better Auth always has id separately from fields map.
        expect(
          fieldNames.has(fieldName),
          `${prismaName} missing Better Auth field "${fieldName}" (${field.type})`,
        ).toBe(true);
      }
    }

    const authAccount = byName.get("AuthAccount")!;
    const issuer = authAccount.fields.find((f) => f.name === "issuer");
    expect(issuer?.isRequired).toBe(true);
    expect(issuer?.type).toBe("String");

    const unique = authAccount.uniqueFields.some(
      (u) => u.length === 2 && u[0] === "issuer" && u[1] === "accountId",
    );
    const uniqueIndexes = (authAccount.uniqueIndexes ?? []).some(
      (u) =>
        u.fields.length === 2 &&
        u.fields[0] === "issuer" &&
        u.fields[1] === "accountId",
    );
    expect(unique || uniqueIndexes).toBe(true);
  });
});

describe("auth error redaction", () => {
  it("redacts password hashes and credential fields from Prisma-like dumps", () => {
    const raw =
      'Unknown argument `issuer`. Available: password: "$2b$10$abcdefghijklmnopqrstuv", accountId: "u1"';
    // Simulate the production failure shape that leaked the hash in argument dumps:
    const withHash =
      'Invalid `prisma.authAccount.create()` invocation: { data: { password: "$2b$10$ABCDEFGHIJKLMNOPQRSTUV.xyz0123456789abcd", providerId: "credential", issuer: "local:credential" } }';
    const redacted = redactAuthErrorMessage(withHash);
    expect(redacted).not.toContain("$2b$");
    expect(redacted).toContain("[REDACTED");
    expect(redacted).toContain("issuer");
    expect(formatSafeErrorForLog(new Error(raw))).not.toMatch(/\$2[aby]\$/);
  });
});

describe.skipIf(!hasDatabase)(
  "Better Auth credential signup persistence (live Prisma)",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    const email = `ba-schema-${suffix}@example.test`;
    const password = "schema-drift-password-ok";

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        // Require issuer column — skip if migration not applied yet.
        await prisma.$queryRaw`SELECT "issuer" FROM "auth_account" LIMIT 0`;
        ready = true;
      } catch {
        console.warn(
          "Skipping Better Auth live signup test: apply auth_account.issuer migration (npm run db:deploy).",
        );
      }
    });

    afterAll(async () => {
      if (!prisma) return;
      try {
        const user = await prisma.authUser.findUnique({ where: { email } });
        if (user) {
          await prisma.authAccount.deleteMany({ where: { userId: user.id } });
          await prisma.authSession.deleteMany({ where: { userId: user.id } });
          await prisma.user.deleteMany({ where: { authUserId: user.id } });
          await prisma.authUser.delete({ where: { id: user.id } });
        }
      } catch {
        // best-effort cleanup
      }
      await prisma.$disconnect();
    });

    it("Better Auth signUpEmail persists AuthAccount.issuer and supports sign-in", async () => {
      if (!ready) return;

      const { auth } = await import("@/lib/auth/better-auth");
      const { beginPlatformSuperAdminProvisioning, endPlatformSuperAdminProvisioning } =
        await import("@/lib/auth/platform-provision-flag");

      // Avoid creating a customer org during this schema probe.
      beginPlatformSuperAdminProvisioning();
      let signUpResult: unknown;
      try {
        signUpResult = await auth.api.signUpEmail({
          body: {
            email,
            password,
            name: "Schema Probe",
            firstName: "Schema",
            lastName: "Probe",
          },
        });
      } finally {
        endPlatformSuperAdminProvisioning();
      }

      const authUserId =
        signUpResult &&
        typeof signUpResult === "object" &&
        "user" in signUpResult &&
        (signUpResult as { user?: { id?: string } }).user?.id
          ? String((signUpResult as { user: { id: string } }).user.id)
          : (
              await prisma.authUser.findUniqueOrThrow({ where: { email } })
            ).id;

      const account = await prisma.authAccount.findFirst({
        where: { userId: authUserId, providerId: "credential" },
      });
      expect(account).toBeTruthy();
      expect(account!.issuer).toBe("local:credential");
      expect(account!.accountId).toBe(authUserId);
      expect(account!.password).toBeTruthy();
      expect(account!.password).not.toBe(password);

      // Mark verified so sign-in can authenticate the credential (normal signup
      // still requires verification; this only unlocks the auth probe).
      await prisma.authUser.update({
        where: { id: authUserId },
        data: { emailVerified: true },
      });

      const signIn = await auth.api.signInEmail({
        body: { email, password },
      });
      expect(signIn).toBeTruthy();
      const signedInUser =
        signIn &&
        typeof signIn === "object" &&
        "user" in signIn &&
        (signIn as { user?: { id?: string } }).user?.id
          ? String((signIn as { user: { id: string } }).user.id)
          : null;
      expect(signedInUser).toBe(authUserId);
    });
  },
);
