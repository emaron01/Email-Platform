/**
 * Approve save-path: projected signal arrays must become PersonaCriterion rows
 * of all four types — a total-only assertion would miss silent positive loss.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

config({ path: ".env.local" });
config();

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

const fourTypeDraft: PersonaAiDraft = {
  name: "Save Path Buyer",
  likelyTitles: ["VP Operations"],
  departmentFunction: "Operations",
  seniority: "VP",
  roleSummary: "Owns forecast process",
  primaryResponsibilities: ["Govern forecast"],
  ownershipAreas: [
    "Forecast process ownership",
    "CRM hygiene ownership",
    "Pipeline inspection ownership",
  ],
  kpisAndAccountabilities: [
    "Forecast accuracy KPI",
    "Pipeline coverage KPI",
    "Deal review cadence KPI",
  ],
  organizationalPressures: [],
  painPoints: [],
  desiredOutcomesFromSolution: [],
  buyingRole: null,
  decisionInfluence: null,
  positiveRoleSignals: [
    "Positive signal alpha",
    "Positive signal beta",
    "Positive signal gamma",
  ],
  negativeRoleSignals: [
    "Negative signal alpha",
    "Negative signal beta",
    "Negative signal gamma",
  ],
  likelyObjections: [],
  terminology: [],
  messagingNotes: [],
  personaSpecificPositioning: [],
  proofPointsToEmphasize: [],
  researchGuidance: [],
  criteria: [],
  confidence: "HIGH",
  evidenceRefs: [],
  provenanceAssessments: [],
};

describe.skipIf(!hasDatabase)(
  "approvePersonaFromSetupRun persists all four criterion types",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let organizationId = "";
    let productId = "";
    let userId = "";
    let personaSetupRunId = "";
    const suffix = `pos-save-${Date.now().toString(36)}`;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        const org = await prisma.organization.create({
          data: { name: `PosSave ${suffix}`, slug: `pos-save-${suffix}` },
        });
        organizationId = org.id;

        const email = `pos-save-${suffix}@example.test`;
        const user = await prisma.user.create({
          data: {
            email,
            emailNormalized: email,
            name: "Pos Save",
          },
        });
        userId = user.id;

        const product = await prisma.product.create({
          data: {
            organizationId,
            name: `Product ${suffix}`,
            approvalStatus: "APPROVED",
            setupStatus: "APPROVED",
            approvedAt: new Date(),
          },
        });
        productId = product.id;

        const source = await prisma.productSource.create({
          data: {
            organizationId,
            productId,
            sourceType: "USER_NOTE",
            displayName: "Notes",
            acquisitionMethod: "USER_PROVIDED",
            contentHash: `pos-save-hash-${suffix}`,
            status: "EXTRACTED",
            extractedText: "forecast notes",
          },
        });
        const bundle = await prisma.productEvidenceBundle.create({
          data: {
            organizationId,
            productId,
            version: 1,
            correlationId: `pos-save-c-${suffix}`,
            sourceIdsJson: [source.id],
            status: "APPROVED",
          },
        });

        const run = await prisma.personaSetupRun.create({
          data: {
            organizationId,
            productId,
            productEvidenceBundleId: bundle.id,
            correlationId: `pos-save-run-${suffix}`,
            status: "NEEDS_REVIEW",
            suggestionKey: `sk-${suffix}`,
            personaDraftJson: fourTypeDraft as object,
          },
        });
        personaSetupRunId = run.id;
        ready = true;
      } catch (e) {
        console.warn("Skipping approve save-path DB test — run db:deploy:", e);
      }
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    it("creates positive, negative, ownership, and responsibility rows with expected counts", async () => {
      if (!ready) return;

      const { approvePersonaFromSetupRun } = await import(
        "@/lib/persona-research/approve"
      );

      const personaId = await approvePersonaFromSetupRun({
        organizationId,
        productId,
        userId,
        personaSetupRunId,
        fields: {
          name: fourTypeDraft.name,
          department: fourTypeDraft.departmentFunction ?? null,
          seniority: fourTypeDraft.seniority ?? null,
          definition: fourTypeDraft.roleSummary ?? null,
          likelyTitles: fourTypeDraft.likelyTitles,
          responsibilities: fourTypeDraft.primaryResponsibilities,
          painPoints: [],
          desiredOutcomes: [],
          messagingNotes: null,
        },
      });

      const rows = await prisma.personaCriterion.findMany({
        where: { organizationId, personaId },
        select: { criterionType: true, name: true, isDisqualifier: true },
      });

      const byType = {
        positive_role_signal: rows.filter(
          (r) => r.criterionType === "positive_role_signal",
        ).length,
        negative_role_signal: rows.filter(
          (r) => r.criterionType === "negative_role_signal",
        ).length,
        ownership: rows.filter((r) => r.criterionType === "ownership").length,
        responsibility: rows.filter((r) => r.criterionType === "responsibility")
          .length,
      };

      // Policy default max is 15; with 3 of each type all fit without dropping.
      expect(DEFAULT_RESEARCH_POLICY_VALUES.maxProjectedPersonaCriteria).toBe(
        15,
      );
      expect(byType.positive_role_signal).toBe(3);
      expect(byType.negative_role_signal).toBe(3);
      expect(byType.ownership).toBe(3);
      expect(byType.responsibility).toBe(3);
      expect(
        rows
          .filter((r) => r.criterionType === "positive_role_signal")
          .every((r) => r.isDisqualifier === false),
      ).toBe(true);
      expect(
        rows
          .filter((r) => r.criterionType === "negative_role_signal")
          .every((r) => r.isDisqualifier === true),
      ).toBe(true);
    });
  },
);
