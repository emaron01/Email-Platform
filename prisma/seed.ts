import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_RESEARCH_POLICY_VALUES,
  DEFAULT_USAGE_POLICY_VALUES,
} from "../src/lib/usage/defaults";
import { ensureTransactionalTemplatesSeeded } from "../src/lib/transactional-email/seed";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run development seed against production.");
  }

  const org = await prisma.organization.upsert({
    where: { slug: "dev-test-org" },
    update: {
      name: "[DEV] Test Organization",
      status: "ACTIVE",
    },
    create: {
      name: "[DEV] Test Organization",
      slug: "dev-test-org",
      status: "ACTIVE",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "dev-owner@example.test" },
    update: {
      name: "[DEV] Test Owner",
      firstName: "Dev",
      lastName: "Owner",
      emailNormalized: "dev-owner@example.test",
      platformRole: "SUPER_ADMIN",
      emailVerifiedAt: new Date(),
      activeOrganizationId: org.id,
    },
    create: {
      email: "dev-owner@example.test",
      emailNormalized: "dev-owner@example.test",
      name: "[DEV] Test Owner",
      firstName: "Dev",
      lastName: "Owner",
      platformRole: "SUPER_ADMIN",
      emailVerifiedAt: new Date(),
      activeOrganizationId: org.id,
    },
  });

  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    update: {
      role: "OWNER",
      isBillingContact: true,
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
      isBillingContact: true,
    },
  });

  await prisma.organizationBillingProfile.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      billingEmail: user.email,
    },
  });

  await ensureTransactionalTemplatesSeeded();

  await prisma.organizationUsagePolicy.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      activeResearchedCompanyLimit:
        DEFAULT_USAGE_POLICY_VALUES.activeResearchedCompanyLimit,
      dailyEmailGenerationLimit:
        DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
    },
  });

  await prisma.researchPolicy.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      maxSearchQueriesPerCompany:
        DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
      maxSourcesPerCompany: DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
      researchFreshnessDays:
        DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
    },
  });

  const existingProduct = await prisma.product.findFirst({
    where: {
      organizationId: org.id,
      name: "[DEV] Example Product",
    },
  });

  const product =
    existingProduct ??
    (await prisma.product.create({
      data: {
        organizationId: org.id,
        name: "[DEV] Example Product",
        description: "Temporary development seed product. Safe to delete.",
        valueProposition: "Helps teams send better outbound email.",
        averageOrderValue: 1200,
        websiteUrl: "https://example.test",
      },
    }));

  const existingOffer = await prisma.offer.findFirst({
    where: {
      organizationId: org.id,
      name: "[DEV] Example Offer",
    },
  });

  const offer =
    existingOffer ??
    (await prisma.offer.create({
      data: {
        organizationId: org.id,
        name: "[DEV] Example Offer",
        description: "Temporary development seed offer (legacy table).",
        primaryCta: "Book a demo",
        notes: "Seed data only. Prefer campaign offer fields for new campaigns.",
      },
    }));

  const existingIcp = await prisma.icp.findFirst({
    where: {
      organizationId: org.id,
      productId: product.id,
      name: "[DEV] Example ICP",
    },
  });

  const icp =
    existingIcp ??
    (await prisma.icp.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        name: "[DEV] Example ICP",
        description: "Temporary development seed ICP.",
        targetIndustries: ["Software", "SaaS"],
        minEmployees: 50,
        maxEmployees: 500,
        minRevenue: 5_000_000,
        maxRevenue: 50_000_000,
        targetGeographies: ["United States"],
        requiredTechnologies: ["Salesforce"],
        positiveSignals: ["Hiring SDRs", "Recently raised funding"],
        negativeSignals: ["No outbound motion"],
        notes: "Seed data only.",
      },
    }));

  const existingPersona = await prisma.persona.findFirst({
    where: {
      organizationId: org.id,
      productId: product.id,
      name: "[DEV] Example Persona",
    },
  });

  const persona =
    existingPersona ??
    (await prisma.persona.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        name: "[DEV] Example Persona",
        targetTitles: ["VP Sales", "Head of Growth"],
        department: "Sales",
        seniority: "VP",
        responsibilities: "Owns pipeline and outbound productivity.",
        painPoints: "Low reply rates and inconsistent messaging.",
        desiredOutcomes: "Higher meeting volume with less manual writing.",
        messagingNotes: "Keep concise and outcome-focused.",
      },
    }));

  console.log("Development seed complete.");
  console.log("");
  console.log("Set this in .env.local (local bypass only):");
  console.log(`DEV_ORGANIZATION_ID=${org.id}`);
  console.log(`DEV_USER_ID=${user.id}`);
  console.log("ALLOW_DEV_TENANT_BYPASS=true");
  console.log("");
  console.log("Seeded ids:");
  console.log(`  Organization: ${org.id}`);
  console.log(`  User:         ${user.id}`);
  console.log(`  Product:      ${product.id}`);
  console.log(`  Offer:        ${offer.id} (legacy table)`);
  console.log(`  ICP:          ${icp.id}`);
  console.log(`  Persona:      ${persona.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
