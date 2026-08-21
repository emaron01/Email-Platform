"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  AuthorizationError,
  requireOrgAdmin,
  getMembershipForCurrentUser,
} from "@/lib/org/authz";
import {
  createOrganizationInvitation,
  renameOrganizationWorkspace,
} from "@/lib/org/signup";

function asPositiveInt(value: FormDataEntryValue | null, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

export async function updateOrganizationUsagePolicyAction(
  formData: FormData,
): Promise<void> {
  const { organization } = await requireOrgAdmin();
  const activeResearchedCompanyLimit = asPositiveInt(
    formData.get("activeResearchedCompanyLimit"),
    "Active researched company limit",
  );
  const dailyEmailGenerationLimit = asPositiveInt(
    formData.get("dailyEmailGenerationLimit"),
    "Daily email generation limit",
  );

  await prisma.organizationUsagePolicy.upsert({
    where: { organizationId: organization.id },
    update: {
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
    },
    create: {
      organizationId: organization.id,
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
    },
  });

  revalidatePath("/settings/usage");
  revalidatePath("/settings/organization");
}

export async function updateResearchPolicyAction(
  formData: FormData,
): Promise<void> {
  const { organization } = await requireOrgAdmin();
  const maxSearchQueriesPerCompany = asPositiveInt(
    formData.get("maxSearchQueriesPerCompany"),
    "Max search queries per company",
  );
  const maxSourcesPerCompany = asPositiveInt(
    formData.get("maxSourcesPerCompany"),
    "Max sources per company",
  );
  const researchFreshnessDays = asPositiveInt(
    formData.get("researchFreshnessDays"),
    "Research freshness days",
  );

  if (maxSearchQueriesPerCompany < 1) {
    throw new Error("Max search queries must be at least 1.");
  }
  if (researchFreshnessDays < 1) {
    throw new Error("Research freshness days must be at least 1.");
  }

  await prisma.researchPolicy.upsert({
    where: { organizationId: organization.id },
    update: {
      maxSearchQueriesPerCompany,
      maxSourcesPerCompany,
      researchFreshnessDays,
    },
    create: {
      organizationId: organization.id,
      maxSearchQueriesPerCompany,
      maxSourcesPerCompany,
      researchFreshnessDays,
    },
  });

  revalidatePath("/settings/usage");
  revalidatePath("/settings/organization");
}

export async function updateOrganizationTimezoneAction(
  formData: FormData,
): Promise<void> {
  const { organization } = await requireOrgAdmin();
  const timezone = String(formData.get("timezone") ?? "").trim() || "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error("Invalid IANA timezone.");
  }

  await prisma.organization.update({
    where: { id: organization.id },
    data: { timezone },
  });

  revalidatePath("/settings/usage");
  revalidatePath("/settings/organization");
}

export async function upsertUserUsageOverrideAction(
  formData: FormData,
): Promise<void> {
  const { organization } = await requireOrgAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) throw new Error("User is required.");

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId,
      },
    },
  });
  if (!membership) {
    throw new AuthorizationError(
      "User is not a member of this organization.",
    );
  }

  const activeRaw = String(
    formData.get("activeResearchedCompanyLimit") ?? "",
  ).trim();
  const emailRaw = String(
    formData.get("dailyEmailGenerationLimit") ?? "",
  ).trim();

  const activeResearchedCompanyLimit =
    activeRaw === "" ? null : asPositiveInt(activeRaw, "Active company limit");
  const dailyEmailGenerationLimit =
    emailRaw === "" ? null : asPositiveInt(emailRaw, "Daily email limit");

  if (
    activeResearchedCompanyLimit == null &&
    dailyEmailGenerationLimit == null
  ) {
    await prisma.userUsageOverride.deleteMany({
      where: { organizationId: organization.id, userId },
    });
  } else {
    await prisma.userUsageOverride.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId,
        },
      },
      update: {
        activeResearchedCompanyLimit,
        dailyEmailGenerationLimit,
      },
      create: {
        organizationId: organization.id,
        userId,
        activeResearchedCompanyLimit,
        dailyEmailGenerationLimit,
      },
    });
  }

  revalidatePath("/settings/usage");
  revalidatePath("/settings/organization");
}

export async function renameWorkspaceAction(
  formData: FormData,
): Promise<void> {
  const { organization, user } = await getMembershipForCurrentUser();
  const name = String(formData.get("name") ?? "").trim();
  await renameOrganizationWorkspace({
    organizationId: organization.id,
    actorUserId: user.id,
    name,
  });
  revalidatePath("/settings/organization");
}

export async function inviteUserAction(formData: FormData): Promise<void> {
  const { organization, user } = await requireOrgAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "MEMBER").trim();
  const role =
    roleRaw === "ADMIN" || roleRaw === "MEMBER" ? roleRaw : "MEMBER";

  await createOrganizationInvitation({
    organizationId: organization.id,
    invitedByUserId: user.id,
    email,
    role,
  });

  revalidatePath("/settings/organization");
}
