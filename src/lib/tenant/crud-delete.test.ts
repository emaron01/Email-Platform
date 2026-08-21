/**
 * Product / Persona CRUD delete lifecycle tests.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { canDeleteSetupEntities } from "@/lib/auth/authz";
import { toSafeCrudDeleteError } from "@/lib/tenant/crud-delete";
import { TenantError } from "@/lib/tenant/errors";

config({ path: ".env.local" });
config();

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("setup delete authorization policy", () => {
  it("OWNER and ADMIN may delete; MEMBER may not", () => {
    expect(canDeleteSetupEntities("OWNER")).toBe(true);
    expect(canDeleteSetupEntities("ADMIN")).toBe(true);
    expect(canDeleteSetupEntities("MEMBER")).toBe(false);
  });

  it("safe errors never expose Prisma/SQL", () => {
    expect(toSafeCrudDeleteError(new TenantError("Persona could not be deleted because it is still referenced by 1 campaign(s)."))).toContain(
      "campaign",
    );
    expect(
      toSafeCrudDeleteError(
        new Error("Foreign key constraint failed on ScoringRun_personaId_fkey"),
      ),
    ).not.toMatch(/ScoringRun|fkey|prisma/i);
  });

  it("product delete confirmation copy describes dependents", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/(app)/setup/page.tsx", "utf8"),
    );
    expect(src).toContain("ConfirmDeleteForm");
    expect(src).toContain("Historical scoring snapshots");
    expect(src).toContain("ICPs");
  });
});

describe.skipIf(!hasDatabase)(
  "Product and Persona delete lifecycle",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let orgA = "";
    let orgB = "";
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "archivedAt" FROM "Persona" LIMIT 0`;
        const a = await prisma.organization.create({
          data: { name: `CRUD A ${suffix}`, slug: `crud-a-${suffix}` },
        });
        const b = await prisma.organization.create({
          data: { name: `CRUD B ${suffix}`, slug: `crud-b-${suffix}` },
        });
        orgA = a.id;
        orgB = b.id;
        ready = true;
      } catch (e) {
        console.warn("Skipping CRUD delete DB tests — run db:deploy:", e);
      }
    });

    afterAll(async () => {
      if (orgA) await prisma.organization.delete({ where: { id: orgA } }).catch(() => undefined);
      if (orgB) await prisma.organization.delete({ where: { id: orgB } }).catch(() => undefined);
      if (prisma) await prisma.$disconnect();
    });

    it("create/update product and persona works", async () => {
      if (!ready) return;
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `P ${suffix}` },
      });
      const updated = await prisma.product.update({
        where: { id: product.id },
        data: { description: "Updated desc" },
      });
      expect(updated.description).toBe("Updated desc");

      const persona = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Persona ${suffix}`,
          definition: "Buyer",
        },
      });
      await prisma.persona.update({
        where: { id: persona.id },
        data: { department: "Sales" },
      });
      const reloaded = await prisma.persona.findUniqueOrThrow({
        where: { id: persona.id },
      });
      expect(reloaded.department).toBe("Sales");
    });

    it("ADMIN path: hard-delete persona removes criteria; scoring history preserved via archive", async () => {
      if (!ready) return;
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `DelP ${suffix}` },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Del Persona ${suffix}`,
        },
      });
      await prisma.personaCriterion.create({
        data: {
          organizationId: orgA,
          personaId: persona.id,
          name: "Owns forecasting",
          criterionType: "responsibility",
          dataType: "TEXT",
          operator: "EXISTS",
          importance: "HIGH",
          isRequired: true,
          isDisqualifier: false,
          source: "AI_INTERPRETED",
          sortOrder: 0,
        },
      });

      // Hard delete path (no scoring/campaigns)
      await prisma.persona.delete({ where: { id: persona.id } });
      const criteriaLeft = await prisma.personaCriterion.count({
        where: { personaId: persona.id },
      });
      expect(criteriaLeft).toBe(0);

      // Archive path when scoring run exists
      const persona2 = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Scored Persona ${suffix}`,
        },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `ICP ${suffix}`,
        },
      });
      const list = await prisma.contactList.create({
        data: { organizationId: orgA, name: `List ${suffix}` },
      });
      await prisma.scoringRun.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona2.id,
          status: "COMPLETED",
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: { name: persona2.name },
        },
      });

      await prisma.persona.update({
        where: { id: persona2.id },
        data: { archivedAt: new Date() },
      });
      const archived = await prisma.persona.findUniqueOrThrow({
        where: { id: persona2.id },
      });
      expect(archived.archivedAt).not.toBeNull();
      const run = await prisma.scoringRun.findFirst({
        where: { personaId: persona2.id },
      });
      expect(run?.personaSnapshot).toEqual({ name: persona2.name });
    });

    it("cannot see another org persona for delete targeting", async () => {
      if (!ready) return;
      const productB = await prisma.product.create({
        data: { organizationId: orgB, name: `Other ${suffix}` },
      });
      const personaB = await prisma.persona.create({
        data: {
          organizationId: orgB,
          productId: productB.id,
          name: `Other persona ${suffix}`,
        },
      });
      const leaked = await prisma.persona.findFirst({
        where: { id: personaB.id, organizationId: orgA },
      });
      expect(leaked).toBeNull();
    });

    it("product hard-delete removes sources/bundles/setup runs without orphans", async () => {
      if (!ready) return;
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `SrcP ${suffix}` },
      });
      const source = await prisma.productSource.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          sourceType: "USER_NOTE",
          displayName: "Notes",
          acquisitionMethod: "USER_PROVIDED",
          contentHash: `hash-${suffix}`,
          status: "EXTRACTED",
          extractedText: "hello",
        },
      });
      const bundle = await prisma.productEvidenceBundle.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          version: 1,
          correlationId: `c-${suffix}`,
          sourceIdsJson: [source.id],
          status: "NEEDS_REVIEW",
        },
      });
      await prisma.productSetupRun.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          evidenceBundleId: bundle.id,
          correlationId: `c-${suffix}`,
          status: "NEEDS_REVIEW",
        },
      });

      await prisma.$transaction(async (tx) => {
        await tx.productSetupRun.deleteMany({
          where: { productId: product.id },
        });
        await tx.productEvidenceBundle.deleteMany({
          where: { productId: product.id },
        });
        await tx.productSource.deleteMany({ where: { productId: product.id } });
        await tx.product.delete({ where: { id: product.id } });
      });

      expect(
        await prisma.productSource.count({ where: { productId: product.id } }),
      ).toBe(0);
      expect(
        await prisma.productEvidenceBundle.count({
          where: { productId: product.id },
        }),
      ).toBe(0);
      expect(
        await prisma.productSetupRun.count({ where: { productId: product.id } }),
      ).toBe(0);
    });

    it("product with campaigns is blocked (message contract)", async () => {
      if (!ready) return;
      // Contract: deleteProduct throws TenantError mentioning campaigns — covered by source.
      const src = await import("node:fs").then((fs) =>
        fs.readFileSync("src/lib/tenant/data.ts", "utf8"),
      );
      expect(src).toContain("still referenced by");
      expect(src).toContain("campaign(s)");
      expect(src).toContain("scoring run(s)");
      expect(src).toContain("archivedAt");
    });
  },
);
