/**
 * READ-ONLY inventory of likely test rows in the database from `.env.local`.
 * Prints counts. Never DELETE / UPDATE / TRUNCATE.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set; cannot inventory production.");
  process.exit(1);
}

const host = new URL(databaseUrl).hostname;
console.log("Read-only pollution inventory (credentials redacted):");
console.log(`  Host: ${host}`);
console.log("");

const prisma = new PrismaClient();

const KNOWN_UNPREFIXED_TEST_ORG =
  /^(CampDel |CRUD |PosSave |Persona Save Org|Prod Research Org|Review persist |Campaign contacts |Other |CRUD A |CRUD B )/;

function isSignupStyleWorkspace(name) {
  return /'s Workspace$/.test(name);
}

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true },
  });
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      authUserId: true,
    },
  });
  const memberships = await prisma.organizationMembership.findMany({
    select: { organizationId: true, userId: true },
  });

  const exampleTestUserIds = new Set(
    users
      .filter((user) => user.email.toLowerCase().endsWith("@example.test"))
      .map((user) => user.id),
  );
  const orgsWithExampleTestMember = new Set(
    memberships
      .filter((row) => exampleTestUserIds.has(row.userId))
      .map((row) => row.organizationId),
  );

  const identifiedTestOrgIds = new Set();
  let nameTestPrefix = 0;
  let nameDevPrefix = 0;
  let signupStyleWorkspace = 0;
  let unprefixedWorkspace = 0;
  let slugTest = 0;
  let knownUnprefixedTest = 0;

  for (const org of orgs) {
    const testPrefix = org.name.startsWith("[TEST]");
    const devPrefix = org.name.startsWith("[DEV]");
    const signup = isSignupStyleWorkspace(org.name);
    const unprefixed =
      signup && !testPrefix && !devPrefix;
    const known = KNOWN_UNPREFIXED_TEST_ORG.test(org.name);
    const slugLooksTest =
      org.slug.startsWith("test-") || org.slug.includes("-test-");

    if (testPrefix) nameTestPrefix += 1;
    if (devPrefix) nameDevPrefix += 1;
    if (signup) signupStyleWorkspace += 1;
    if (unprefixed) unprefixedWorkspace += 1;
    if (slugLooksTest) slugTest += 1;
    if (known) knownUnprefixedTest += 1;

    if (
      testPrefix ||
      devPrefix ||
      known ||
      slugLooksTest ||
      orgsWithExampleTestMember.has(org.id)
    ) {
      identifiedTestOrgIds.add(org.id);
    }
  }

  let unprefixedWorkspaceWithTestEmail = 0;
  let unprefixedWorkspaceWithoutTestEmail = 0;
  for (const org of orgs) {
    if (!isSignupStyleWorkspace(org.name)) continue;
    if (org.name.startsWith("[TEST]") || org.name.startsWith("[DEV]")) continue;
    if (orgsWithExampleTestMember.has(org.id)) {
      unprefixedWorkspaceWithTestEmail += 1;
    } else {
      unprefixedWorkspaceWithoutTestEmail += 1;
    }
  }

  const ids = [...identifiedTestOrgIds];

  async function scoped(model) {
    const total = await prisma[model].count();
    const inIdentifiedTestOrgs =
      ids.length === 0
        ? 0
        : await prisma[model].count({
            where: { organizationId: { in: ids } },
          });
    return { total, in_identified_test_orgs: inIdentifiedTestOrgs };
  }

  const personas = await prisma.persona.findMany({
    select: { name: true, organizationId: true },
  });
  const contactResearch = await prisma.contactResearch.findMany({
    select: {
      organizationId: true,
      aiProvider: true,
      status: true,
      confidence: true,
    },
  });

  let authUsers = { total: null, example_test_email: null };
  try {
    const rows = await prisma.authUser.findMany({ select: { email: true } });
    authUsers = {
      total: rows.length,
      example_test_email: rows.filter((row) =>
        row.email.toLowerCase().endsWith("@example.test"),
      ).length,
    };
  } catch {
    authUsers = { total: "unavailable", example_test_email: "unavailable" };
  }

  const leftoverOrgs = orgs
    .filter((org) => !identifiedTestOrgIds.has(org.id))
    .map((org) => ({
      name: org.name,
      slug: org.slug,
    }));

  const leftoverUserClasses = {
    total_not_example_test: users.filter(
      (user) => !user.email.toLowerCase().endsWith("@example.test"),
    ).length,
  };

  const report = {
    host,
    identification: {
      identified_test_org:
        "name starts with [TEST] or [DEV], known unprefixed test names from suites, slug test-*, or a member with @example.test",
      unprefixed_workspaces:
        "name ends with \"'s Workspace\" without [TEST]/[DEV]; split by @example.test membership",
      note: "Unprefixed workspaces without @example.test may be real signups. Do not delete those without review.",
    },
    Organization: {
      total: orgs.length,
      name_test_prefix: nameTestPrefix,
      name_dev_prefix: nameDevPrefix,
      signup_style_workspace: signupStyleWorkspace,
      unprefixed_workspace: unprefixedWorkspace,
      unprefixed_workspace_with_example_test_email:
        unprefixedWorkspaceWithTestEmail,
      unprefixed_workspace_without_example_test_email:
        unprefixedWorkspaceWithoutTestEmail,
      known_unprefixed_test_names: knownUnprefixedTest,
      slug_test: slugTest,
      identified_test_or_dev_orgs: ids.length,
      orgs_with_example_test_member: orgsWithExampleTestMember.size,
    },
    User: {
      total: users.length,
      example_test_email: exampleTestUserIds.size,
      test_auth_id: users.filter((user) =>
        (user.authUserId ?? "").startsWith("test_auth_"),
      ).length,
      name_prefix: users.filter(
        (user) =>
          (user.name ?? "").startsWith("[TEST]") ||
          (user.name ?? "").startsWith("[DEV]"),
      ).length,
    },
    AuthUser: authUsers,
    Product: await scoped("product"),
    Icp: await scoped("icp"),
    Persona: {
      ...(await scoped("persona")),
      name_test_prefix: personas.filter((row) =>
        row.name.startsWith("[TEST]"),
      ).length,
      sales_leader_fixture: personas.filter((row) =>
        row.name.includes("Sales leader"),
      ).length,
    },
    ContactList: await scoped("contactList"),
    Contact: await scoped("contact"),
    Company: await scoped("company"),
    CompanyResearch: await scoped("companyResearch"),
    ContactResearch: {
      ...(await scoped("contactResearch")),
      null_provider: contactResearch.filter((row) => row.aiProvider == null)
        .length,
      completed_null_provider: contactResearch.filter(
        (row) => row.aiProvider == null && row.status === "COMPLETED",
      ).length,
      completed_high_null_provider: contactResearch.filter(
        (row) =>
          row.aiProvider == null &&
          row.status === "COMPLETED" &&
          row.confidence === "HIGH",
      ).length,
      completed_null_provider_in_identified_test_orgs: contactResearch.filter(
        (row) =>
          row.aiProvider == null &&
          row.status === "COMPLETED" &&
          identifiedTestOrgIds.has(row.organizationId),
      ).length,
    },
    ScoringRun: await scoped("scoringRun"),
    ContactScore: await scoped("contactScore"),
    Campaign: await scoped("campaign"),
    UsageEvent: await scoped("usageEvent"),
    leftover_not_classified_as_test: {
      organizations: leftoverOrgs,
      users_without_example_test_email: leftoverUserClasses.total_not_example_test,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  console.log("");
  console.log("No rows were deleted or updated.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
