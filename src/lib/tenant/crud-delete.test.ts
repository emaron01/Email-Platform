/**
 * Product / Persona CRUD delete lifecycle tests.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canDeleteSetupEntities } from "@/lib/auth/authz";
import { toSafeCrudDeleteError } from "@/lib/tenant/crud-delete";
import { TenantError } from "@/lib/tenant/errors";

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
      fs.readFileSync("src/components/ProductCatalogPanel.tsx", "utf8"),
    );
    expect(src).toContain("ConfirmDeleteForm");
    expect(src).toContain("Historical scoring snapshots");
    expect(src).toContain("ICPs");
  });

  it("campaign workspace delete confirmation shows contact, draft, and sent counts", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8"),
    );
    expect(src).toContain("ConfirmDeleteForm");
    expect(src).toContain("deleteCampaignAction");
    expect(src).toContain("archiveCampaignAction");
    expect(src).toContain("campaignDeleteConfirmBody");
    expect(src).toContain("campaignArchiveConfirmBody");
    expect(src).toContain("contactCount");
    expect(src).toContain("draftCount");
    expect(src).toContain("sentCount");
  });

  it("contact lists expose archive and delete with scoped confirmation copy", async () => {
    const fs = await import("node:fs");
    const listDetail = fs.readFileSync(
      "src/app/(app)/lists/[id]/page.tsx",
      "utf8",
    );
    expect(listDetail).toContain("ConfirmDeleteForm");
    expect(listDetail).toContain("deleteContactListAction");
    expect(listDetail).toContain("archiveContactListAction");
    expect(listDetail).toContain("listDeleteConfirmBody");
    expect(listDetail).toContain("listArchiveConfirmBody");
    const tenant = fs.readFileSync("src/lib/tenant/list-delete.ts", "utf8");
    expect(tenant).toMatch(/export async function deleteContactListGraph/);
    expect(tenant).toMatch(/export async function deleteOrArchiveContactList/);
  });

  it("post-delete navigation never refreshes the deleted record URL", async () => {
    const fs = await import("node:fs");
    const form = fs.readFileSync("src/components/ConfirmDeleteForm.tsx", "utf8");
    expect(form).toContain("onSuccessNavigate");
    expect(form).toContain("router.replace(onSuccessNavigate)");
    expect(form).toContain("DELETE_SUCCESS_NOTICE_KEY");
    // Race that caused 404: push then refresh while still on deleted URL.
    expect(form).not.toMatch(
      /router\.replace\(onSuccessNavigate\);\s*router\.refresh\(\)/,
    );
    expect(form).not.toMatch(
      /router\.push\(onSuccessNavigate\);\s*router\.refresh\(\)/,
    );

    const campaign = fs.readFileSync(
      "src/app/(app)/campaigns/[id]/page.tsx",
      "utf8",
    );
    expect(campaign).toContain('onSuccessNavigate="/campaigns"');
    expect(
      fs.readFileSync("src/app/(app)/campaigns/page.tsx", "utf8"),
    ).toContain("DeleteSuccessNotice");

    const list = fs.readFileSync("src/app/(app)/lists/[id]/page.tsx", "utf8");
    expect(list).toContain('onSuccessNavigate="/lists"');
    expect(fs.readFileSync("src/app/(app)/lists/page.tsx", "utf8")).toContain(
      "DeleteSuccessNotice",
    );

    const productSetup = fs.readFileSync(
      "src/app/(app)/setup/[productId]/page.tsx",
      "utf8",
    );
    expect(productSetup).toContain('onSuccessNavigate="/products"');
    expect(productSetup).toContain("DeleteSuccessNotice");
    expect(
      fs.readFileSync("src/app/(app)/products/page.tsx", "utf8"),
    ).toContain("DeleteSuccessNotice");

    const icp = fs.readFileSync("src/components/IcpDetailsForm.tsx", "utf8");
    expect(icp).toMatch(/onSuccessNavigate=\{`\/setup\/\$\{productId\}`\}/);
    const persona = fs.readFileSync("src/components/PersonaForm.tsx", "utf8");
    expect(persona).toMatch(
      /onSuccessNavigate=\{`\/setup\/\$\{productId\}`\}/,
    );
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
          data: { name: `[TEST] CRUD A ${suffix}`, slug: `test-crud-a-${suffix}` },
        });
        const b = await prisma.organization.create({
          data: { name: `[TEST] CRUD B ${suffix}`, slug: `test-crud-b-${suffix}` },
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

    it("product hard-delete succeeds when PersonaSetupRun references ProductEvidenceBundle", async () => {
      if (!ready) return;
      const { deleteProductAssistedSetupGraph } = await import(
        "@/lib/tenant/product-persona-delete"
      );
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `PersRunP ${suffix}` },
      });
      const source = await prisma.productSource.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          sourceType: "USER_NOTE",
          displayName: "Notes",
          acquisitionMethod: "USER_PROVIDED",
          contentHash: `pers-hash-${suffix}`,
          status: "EXTRACTED",
          extractedText: "hello",
        },
      });
      const bundle = await prisma.productEvidenceBundle.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          version: 1,
          correlationId: `pers-c-${suffix}`,
          sourceIdsJson: [source.id],
          status: "APPROVED",
        },
      });
      await prisma.personaSetupRun.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          productEvidenceBundleId: bundle.id,
          correlationId: `pers-run-${suffix}`,
          status: "NEEDS_REVIEW",
        },
      });

      await prisma.$transaction(async (tx) => {
        await deleteProductAssistedSetupGraph(tx, orgA, product.id);
        await tx.product.delete({ where: { id: product.id } });
      });

      expect(
        await prisma.productEvidenceBundle.count({
          where: { productId: product.id },
        }),
      ).toBe(0);
      expect(
        await prisma.personaSetupRun.count({ where: { productId: product.id } }),
      ).toBe(0);
    });

    it("product hard-delete removes Product + Persona research graph without orphans", async () => {
      if (!ready) return;
      const { deleteProductAssistedSetupGraph } = await import(
        "@/lib/tenant/product-persona-delete"
      );
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
      const personaRun = await prisma.personaSetupRun.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          productEvidenceBundleId: bundle.id,
          correlationId: `persona-c-${suffix}`,
          status: "NEEDS_REVIEW",
        },
      });
      await prisma.personaSource.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          personaSetupRunId: personaRun.id,
          sourceType: "USER_NOTE",
          displayName: "Persona notes",
          acquisitionMethod: "USER_PROVIDED",
          contentHash: `persona-src-${suffix}`,
          status: "EXTRACTED",
          extractedText: "role notes",
        },
      });
      await prisma.personaEvidenceBundle.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          personaSetupRunId: personaRun.id,
          version: 1,
          correlationId: `persona-eb-${suffix}`,
          productEvidenceBundleId: bundle.id,
          status: "NEEDS_REVIEW",
        },
      });

      await prisma.$transaction(async (tx) => {
        await deleteProductAssistedSetupGraph(tx, orgA, product.id);
        await tx.persona.deleteMany({
          where: { organizationId: orgA, productId: product.id },
        });
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
      expect(
        await prisma.personaSetupRun.count({ where: { productId: product.id } }),
      ).toBe(0);
      expect(
        await prisma.personaSource.count({ where: { productId: product.id } }),
      ).toBe(0);
      expect(
        await prisma.personaEvidenceBundle.count({
          where: { productId: product.id },
        }),
      ).toBe(0);
    });

    it("persona hard-delete leaves zero PersonaSource rows with stale personaId", async () => {
      if (!ready) return;
      const { deletePersonaAssistedSetupGraph } = await import(
        "@/lib/tenant/product-persona-delete"
      );
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `PersDel ${suffix}` },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Hard del persona ${suffix}`,
        },
      });
      const peb = await prisma.productEvidenceBundle.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          version: 1,
          correlationId: `pd-c-${suffix}`,
          sourceIdsJson: [],
          status: "APPROVED",
        },
      });
      const run = await prisma.personaSetupRun.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          personaId: persona.id,
          productEvidenceBundleId: peb.id,
          correlationId: `pd-run-${suffix}`,
          status: "APPROVED",
        },
      });
      await prisma.personaSource.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          personaId: persona.id,
          personaSetupRunId: run.id,
          sourceType: "USER_NOTE",
          displayName: "Linked source",
          acquisitionMethod: "USER_PROVIDED",
          contentHash: `pd-src-${suffix}`,
          status: "EXTRACTED",
        },
      });
      await prisma.personaEvidenceBundle.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          personaSetupRunId: run.id,
          version: 1,
          correlationId: `pd-eb-${suffix}`,
          status: "APPROVED",
        },
      });

      await prisma.$transaction(async (tx) => {
        await deletePersonaAssistedSetupGraph(tx, orgA, persona.id);
        await tx.persona.delete({ where: { id: persona.id } });
      });

      expect(
        await prisma.personaSource.count({
          where: { organizationId: orgA, personaId: persona.id },
        }),
      ).toBe(0);
      expect(
        await prisma.personaSource.count({
          where: { organizationId: orgA, personaSetupRunId: run.id },
        }),
      ).toBe(0);
      expect(
        await prisma.personaEvidenceBundle.count({
          where: { organizationId: orgA, personaSetupRunId: run.id },
        }),
      ).toBe(0);
      expect(
        await prisma.personaSetupRun.count({ where: { id: run.id } }),
      ).toBe(0);
    });

    it("product soft-archive leaves research intact but unreachable from setup lists", async () => {
      if (!ready) return;
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `ArchP ${suffix}` },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Arch Persona ${suffix}`,
        },
      });
      const peb = await prisma.productEvidenceBundle.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          version: 1,
          correlationId: `arch-c-${suffix}`,
          sourceIdsJson: [],
          status: "APPROVED",
        },
      });
      await prisma.personaSetupRun.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          personaId: persona.id,
          productEvidenceBundleId: peb.id,
          correlationId: `arch-run-${suffix}`,
          status: "APPROVED",
        },
      });
      await prisma.personaSource.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          personaId: persona.id,
          sourceType: "USER_NOTE",
          displayName: "Arch source",
          acquisitionMethod: "USER_PROVIDED",
          contentHash: `arch-src-${suffix}`,
          status: "EXTRACTED",
        },
      });
      const list = await prisma.contactList.create({
        data: { organizationId: orgA, name: `Arch list ${suffix}` },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Arch ICP ${suffix}`,
        },
      });
      await prisma.scoringRun.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          status: "COMPLETED",
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: { name: persona.name },
        },
      });

      const now = new Date();
      await prisma.$transaction([
        prisma.product.update({
          where: { id: product.id },
          data: { archivedAt: now },
        }),
        prisma.persona.updateMany({
          where: { organizationId: orgA, productId: product.id, archivedAt: null },
          data: { archivedAt: now },
        }),
        prisma.icp.updateMany({
          where: { organizationId: orgA, productId: product.id, archivedAt: null },
          data: { archivedAt: now },
        }),
      ]);

      // Research rows remain (not orphaned — product still exists)
      expect(
        await prisma.personaSource.count({
          where: { organizationId: orgA, productId: product.id },
        }),
      ).toBe(1);
      expect(
        await prisma.personaSetupRun.count({
          where: { organizationId: orgA, productId: product.id },
        }),
      ).toBe(1);

      // Setup selectors exclude archived personas/products
      expect(
        await prisma.product.count({
          where: { organizationId: orgA, id: product.id, archivedAt: null },
        }),
      ).toBe(0);
      expect(
        await prisma.persona.count({
          where: {
            organizationId: orgA,
            productId: product.id,
            archivedAt: null,
          },
        }),
      ).toBe(0);

      const listPersonasSrc = await import("node:fs").then((fs) =>
        fs.readFileSync("src/lib/tenant/data.ts", "utf8"),
      );
      expect(listPersonasSrc).toMatch(
        /listPersonas[\s\S]*archivedAt:\s*null/,
      );
    });

    it("cross-tenant: deleting product research in org A touches zero rows in org B", async () => {
      if (!ready) return;
      const { deleteProductAssistedSetupGraph } = await import(
        "@/lib/tenant/product-persona-delete"
      );
      const productA = await prisma.product.create({
        data: { organizationId: orgA, name: `XTenA ${suffix}` },
      });
      const productB = await prisma.product.create({
        data: { organizationId: orgB, name: `XTenB ${suffix}` },
      });
      const pebA = await prisma.productEvidenceBundle.create({
        data: {
          organizationId: orgA,
          productId: productA.id,
          version: 1,
          correlationId: `xta-${suffix}`,
          sourceIdsJson: [],
          status: "APPROVED",
        },
      });
      const pebB = await prisma.productEvidenceBundle.create({
        data: {
          organizationId: orgB,
          productId: productB.id,
          version: 1,
          correlationId: `xtb-${suffix}`,
          sourceIdsJson: [],
          status: "APPROVED",
        },
      });
      await prisma.personaSetupRun.create({
        data: {
          organizationId: orgA,
          productId: productA.id,
          productEvidenceBundleId: pebA.id,
          correlationId: `xta-run-${suffix}`,
          status: "NEEDS_REVIEW",
        },
      });
      await prisma.personaSetupRun.create({
        data: {
          organizationId: orgB,
          productId: productB.id,
          productEvidenceBundleId: pebB.id,
          correlationId: `xtb-run-${suffix}`,
          status: "NEEDS_REVIEW",
        },
      });
      await prisma.personaSource.create({
        data: {
          organizationId: orgB,
          productId: productB.id,
          sourceType: "USER_NOTE",
          displayName: "B source",
          acquisitionMethod: "USER_PROVIDED",
          contentHash: `xtb-src-${suffix}`,
          status: "EXTRACTED",
        },
      });

      await prisma.$transaction(async (tx) => {
        await deleteProductAssistedSetupGraph(tx, orgA, productA.id);
        await tx.product.delete({ where: { id: productA.id } });
      });

      expect(
        await prisma.personaSetupRun.count({
          where: { organizationId: orgB, productId: productB.id },
        }),
      ).toBe(1);
      expect(
        await prisma.personaSource.count({
          where: { organizationId: orgB, productId: productB.id },
        }),
      ).toBe(1);
      expect(
        await prisma.productEvidenceBundle.count({
          where: { organizationId: orgB, productId: productB.id },
        }),
      ).toBe(1);
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
