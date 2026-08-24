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
  InvitationError,
  renameOrganizationWorkspace,
  SignupError,
} from "@/lib/org/signup";
import { TenantError } from "@/lib/tenant/errors";

export type SettingsActionResult = { ok: boolean; message: string };

function toSafeSettingsActionError(error: unknown): string {
  if (
    error instanceof AuthorizationError ||
    error instanceof SignupError ||
    error instanceof InvitationError ||
    error instanceof TenantError
  ) {
    return error.message;
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to update settings. Please try again.";
    }
    return error.message;
  }
  return "Unable to update settings. Please try again.";
}

function asPositiveInt(value: FormDataEntryValue | null, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

export async function updateOrganizationUsagePolicyAction(
  _prev: SettingsActionResult | null,
  formData: FormData,
): Promise<SettingsActionResult> {
  try {
    const { organization } = await requireOrgAdmin();
    const activeResearchedCompanyLimit = asPositiveInt(
      formData.get("activeResearchedCompanyLimit"),
      "Active researched company limit",
    );
    const dailyEmailGenerationLimit = asPositiveInt(
      formData.get("dailyEmailGenerationLimit"),
      "Daily email generation limit",
    );
    const dailyEmailSendWarningLimit = asPositiveInt(
      formData.get("dailyEmailSendWarningLimit"),
      "Daily email send warning limit",
    );
    const dailyEmailSendLimit = asPositiveInt(
      formData.get("dailyEmailSendLimit"),
      "Daily email send limit",
    );
    if (dailyEmailSendWarningLimit > dailyEmailSendLimit) {
      throw new Error("Daily send warning limit cannot exceed the send limit.");
    }

    await prisma.organizationUsagePolicy.upsert({
      where: { organizationId: organization.id },
      update: {
        activeResearchedCompanyLimit,
        dailyEmailGenerationLimit,
        dailyEmailSendWarningLimit,
        dailyEmailSendLimit,
      },
      create: {
        organizationId: organization.id,
        activeResearchedCompanyLimit,
        dailyEmailGenerationLimit,
        dailyEmailSendWarningLimit,
        dailyEmailSendLimit,
      },
    });

    revalidatePath("/settings/usage");
    revalidatePath("/settings/organization");
    return { ok: true, message: "Usage policy saved." };
  } catch (error) {
    return { ok: false, message: toSafeSettingsActionError(error) };
  }
}

export async function updateResearchPolicyAction(
  _prev: SettingsActionResult | null,
  formData: FormData,
): Promise<SettingsActionResult> {
  try {
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
    return { ok: true, message: "Research policy saved." };
  } catch (error) {
    return { ok: false, message: toSafeSettingsActionError(error) };
  }
}

export async function updateOrganizationTimezoneAction(
  _prev: SettingsActionResult | null,
  formData: FormData,
): Promise<SettingsActionResult> {
  try {
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
    return { ok: true, message: "Timezone saved." };
  } catch (error) {
    return { ok: false, message: toSafeSettingsActionError(error) };
  }
}

export async function upsertUserUsageOverrideAction(
  _prev: SettingsActionResult | null,
  formData: FormData,
): Promise<SettingsActionResult> {
  try {
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
    const sendWarningRaw = String(
      formData.get("dailyEmailSendWarningLimit") ?? "",
    ).trim();
    const sendLimitRaw = String(
      formData.get("dailyEmailSendLimit") ?? "",
    ).trim();

    const activeResearchedCompanyLimit =
      activeRaw === "" ? null : asPositiveInt(activeRaw, "Active company limit");
    const dailyEmailGenerationLimit =
      emailRaw === "" ? null : asPositiveInt(emailRaw, "Daily email limit");
    const dailyEmailSendWarningLimit =
      sendWarningRaw === ""
        ? null
        : asPositiveInt(sendWarningRaw, "Daily send warning limit");
    const dailyEmailSendLimit =
      sendLimitRaw === ""
        ? null
        : asPositiveInt(sendLimitRaw, "Daily send limit");
    const organizationPolicy =
      await prisma.organizationUsagePolicy.findUniqueOrThrow({
        where: { organizationId: organization.id },
      });
    if (
      (dailyEmailSendWarningLimit ??
        organizationPolicy.dailyEmailSendWarningLimit) >
      (dailyEmailSendLimit ?? organizationPolicy.dailyEmailSendLimit)
    ) {
      throw new Error(
        "Effective daily send warning limit cannot exceed the send limit.",
      );
    }

    if (
      activeResearchedCompanyLimit == null &&
      dailyEmailGenerationLimit == null
      && dailyEmailSendWarningLimit == null
      && dailyEmailSendLimit == null
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
          dailyEmailSendWarningLimit,
          dailyEmailSendLimit,
        },
        create: {
          organizationId: organization.id,
          userId,
          activeResearchedCompanyLimit,
          dailyEmailGenerationLimit,
          dailyEmailSendWarningLimit,
          dailyEmailSendLimit,
        },
      });
    }

    revalidatePath("/settings/usage");
    revalidatePath("/settings/organization");
    return { ok: true, message: "User override saved." };
  } catch (error) {
    return { ok: false, message: toSafeSettingsActionError(error) };
  }
}

export async function renameWorkspaceAction(
  _prev: SettingsActionResult | null,
  formData: FormData,
): Promise<SettingsActionResult> {
  try {
    const { organization, user } = await getMembershipForCurrentUser();
    const name = String(formData.get("name") ?? "").trim();
    await renameOrganizationWorkspace({
      organizationId: organization.id,
      actorUserId: user.id,
      name,
    });
    revalidatePath("/settings/organization");
    return { ok: true, message: "Workspace renamed." };
  } catch (error) {
    return { ok: false, message: toSafeSettingsActionError(error) };
  }
}

export async function inviteUserAction(
  _prev: SettingsActionResult | null,
  formData: FormData,
): Promise<SettingsActionResult> {
  try {
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
    return { ok: true, message: "Invitation created." };
  } catch (error) {
    return { ok: false, message: toSafeSettingsActionError(error) };
  }
}
