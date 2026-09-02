import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth/better-auth";
import { seedContactOnList } from "@/test/contact-seed";
import { testEntityName } from "@/test/database";
import type { SmokeRouteIds } from "@/test/smoke/discover-routes";

const PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG = "approvedProductResynthesis";
const PERSONA_RESYNTHESIS_USER_CONTEXT_FLAG = "approvedPersonaResynthesis";

export type SmokeFixture = SmokeRouteIds & {
  email: string;
  password: string;
};

const SMOKE_PASSWORD = "SmokeTestPass123!";

export async function seedSmokeFixture(prisma: PrismaClient): Promise<SmokeFixture> {
  const suffix = randomUUID().slice(0, 8);
  const email = `smoke-${suffix}@example.test`;
  const password = SMOKE_PASSWORD;

  let signUpResult: unknown;
  signUpResult = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name: testEntityName("Smoke User"),
      firstName: "Smoke",
      lastName: "Tester",
    },
  });

  const authUserId =
    signUpResult &&
    typeof signUpResult === "object" &&
    "user" in signUpResult &&
    (signUpResult as { user?: { id?: string } }).user?.id
      ? String((signUpResult as { user: { id: string } }).user.id)
      : (await prisma.authUser.findUniqueOrThrow({ where: { email } })).id;

  await prisma.authUser.update({
    where: { id: authUserId },
    data: { emailVerified: true },
  });

  const appUser = await prisma.user.findUniqueOrThrow({
    where: { authUserId },
  });

  await prisma.user.update({
    where: { id: appUser.id },
    data: {
      platformRole: "SUPER_ADMIN",
      emailVerifiedAt: new Date(),
    },
  });

  const organizationId = appUser.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Smoke signup did not provision an organization.");
  }

  const product = await prisma.product.create({
    data: {
      organizationId,
      name: testEntityName(`Smoke Product ${suffix}`),
      approvalStatus: "APPROVED",
      setupStatus: "APPROVED",
    },
  });

  const evidenceBundle = await prisma.productEvidenceBundle.create({
    data: {
      organizationId,
      productId: product.id,
      version: 1,
      correlationId: `smoke-${suffix}`,
      status: "APPROVED",
      normalizedEvidenceJson: { excerpts: [] },
      sourceIdsJson: [],
    },
  });

  const productSetupRun = await prisma.productSetupRun.create({
    data: {
      organizationId,
      productId: product.id,
      evidenceBundleId: evidenceBundle.id,
      correlationId: `smoke-setup-${suffix}`,
      status: "APPROVED",
      productDraftJson: {
        description: "Smoke product profile",
        valueProposition: "Smoke value",
        problemsSolved: ["Smoke problem"],
        capabilities: ["Smoke capability"],
        differentiators: [],
        primaryUseCases: [],
        relevantBuyerFunctions: [],
        relevantIndustries: [],
        businessOutcomes: [],
        proofPoints: [],
        customerEvidence: [],
        terminology: [],
        unknownFields: [],
        evidenceRefs: [],
      },
    },
  });

  const productResynthesisRun = await prisma.productSetupRun.create({
    data: {
      organizationId,
      productId: product.id,
      evidenceBundleId: evidenceBundle.id,
      correlationId: `smoke-resynth-${suffix}`,
      status: "NEEDS_REVIEW",
      userContextJson: {
        [PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG]: true,
        priorApproval: {
          approvalStatus: "APPROVED",
          setupStatus: "APPROVED",
          approvedEvidenceBundleId: evidenceBundle.id,
          approvedSetupRunId: productSetupRun.id,
        },
      },
      productDraftJson: {
        description: "Proposed smoke profile",
        valueProposition: "Proposed value",
        problemsSolved: ["Proposed problem"],
        capabilities: ["Proposed capability"],
        differentiators: [],
        primaryUseCases: [],
        relevantBuyerFunctions: [],
        relevantIndustries: [],
        businessOutcomes: [],
        proofPoints: [],
        customerEvidence: [],
        terminology: [],
        unknownFields: [],
        evidenceRefs: [],
      },
    },
  });

  await prisma.product.update({
    where: { id: product.id },
    data: {
      approvedEvidenceBundleId: evidenceBundle.id,
      approvedSetupRunId: productSetupRun.id,
    },
  });

  const icp = await prisma.icp.create({
    data: {
      organizationId,
      productId: product.id,
      name: testEntityName(`Smoke ICP ${suffix}`),
      definition: "Smoke ICP definition",
    },
  });

  const persona = await prisma.persona.create({
    data: {
      organizationId,
      productId: product.id,
      name: testEntityName(`Smoke Persona ${suffix}`),
      approvalStatus: "APPROVED",
      setupStatus: "APPROVED",
    },
  });

  const personaSetupRun = await prisma.personaSetupRun.create({
    data: {
      organizationId,
      productId: product.id,
      personaId: persona.id,
      productEvidenceBundleId: evidenceBundle.id,
      correlationId: `smoke-persona-${suffix}`,
      status: "NEEDS_REVIEW",
      personaDraftJson: {
        roleSummary: "Smoke persona role",
        departmentFunction: "Operations",
        seniority: "Director",
        primaryResponsibilities: ["Own smoke tests"],
        painPoints: ["Flaky routes"],
        desiredOutcomesFromSolution: ["Green smoke"],
        messagingNotes: [],
        likelyTitles: ["Director of Quality"],
        personaSpecificPositioning: null,
        proofPointsToEmphasize: [],
        likelyObjections: [],
      },
    },
  });

  const personaResynthesisRun = await prisma.personaSetupRun.create({
    data: {
      organizationId,
      productId: product.id,
      personaId: persona.id,
      productEvidenceBundleId: evidenceBundle.id,
      correlationId: `smoke-persona-rebuild-${suffix}`,
      status: "NEEDS_REVIEW",
      userContextJson: {
        [PERSONA_RESYNTHESIS_USER_CONTEXT_FLAG]: true,
      },
      personaDraftJson: {
        roleSummary: "Rebuild smoke persona role",
        departmentFunction: "Operations",
        seniority: "Director",
        primaryResponsibilities: ["Own smoke tests"],
        painPoints: ["Boundary bugs"],
        desiredOutcomesFromSolution: ["Green smoke"],
        messagingNotes: [],
        likelyTitles: ["Director of Quality"],
        personaSpecificPositioning: null,
        proofPointsToEmphasize: [],
        likelyObjections: [],
      },
    },
  });

  const list = await prisma.contactList.create({
    data: {
      organizationId,
      name: testEntityName(`Smoke List ${suffix}`),
      sourceType: "PASTE",
      totalContacts: 1,
    },
  });

  await seedContactOnList(prisma, {
    organizationId,
    contactListId: list.id,
    email: `contact-${suffix}@example.test`,
    firstName: "Smoke",
    lastName: "Contact",
  });

  const company = await prisma.company.create({
    data: {
      organizationId,
      name: testEntityName(`Smoke Company ${suffix}`),
      normalizedName: `smoke-company-${suffix}`,
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId,
      name: testEntityName(`Smoke Campaign ${suffix}`),
      productId: product.id,
      icpId: icp.id,
      personaId: persona.id,
      offerName: "Smoke offer",
      status: "DRAFT",
    },
  });

  const scoringRun = await prisma.scoringRun.create({
    data: {
      organizationId,
      contactListId: list.id,
      productId: product.id,
      icpId: icp.id,
      personaId: persona.id,
      status: "PENDING",
      totalContacts: 1,
      scoredContacts: 0,
      productSnapshot: { id: product.id, name: product.name },
      icpSnapshot: { id: icp.id, name: icp.name },
      personaSnapshot: { id: persona.id, name: persona.name },
    },
  });

  return {
    email,
    password,
    organizationId,
    productId: product.id,
    icpId: icp.id,
    personaId: persona.id,
    campaignId: campaign.id,
    listId: list.id,
    companyId: company.id,
    scoringRunId: scoringRun.id,
    productSetupRunId: productSetupRun.id,
    productResynthesisRunId: productResynthesisRun.id,
    personaSetupRunId: personaSetupRun.id,
    personaResynthesisRunId: personaResynthesisRun.id,
  };
}

export async function signInSmokeSession(input: {
  baseUrl: string;
  email: string;
  password: string;
}): Promise<string> {
  const res = await fetch(`${input.baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: input.baseUrl,
    },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Smoke sign-in failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const legacy = res.headers.get("set-cookie");
  const rawCookies = setCookies.length > 0 ? setCookies : legacy ? [legacy] : [];

  const sessionPair = rawCookies
    .map((line) => line.split(";")[0]?.trim())
    .find(
      (line) =>
        line?.startsWith("better-auth.session_token=") ||
        line?.startsWith("__Secure-better-auth.session_token="),
    );

  if (!sessionPair) {
    throw new Error("Smoke sign-in succeeded but no session cookie was returned.");
  }

  return sessionPair;
}

export function smokeServerEnv(input: {
  port: number;
  databaseUrl: string;
}): NodeJS.ProcessEnv {
  const baseUrl = `http://127.0.0.1:${input.port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: input.databaseUrl,
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET?.trim() ||
      "smoke-test-secret-32-characters-minimum",
    BETTER_AUTH_URL: baseUrl,
    APP_URL: baseUrl,
    TRANSACTIONAL_EMAIL_PROVIDER: "console",
  };
  delete env.ALLOW_DEV_TENANT_BYPASS;
  delete env.DEV_ORGANIZATION_ID;
  delete env.DEV_USER_ID;
  return env;
}

export function hashForReport(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
