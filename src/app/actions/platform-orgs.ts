"use server";

import { revalidatePath } from "next/cache";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import {
  grantOrganizationCredit,
  suspendOrganization,
  unsuspendOrganization,
  updateOrganizationUsagePolicyAsPlatform,
} from "@/lib/platform/orgs";

export type PlatformOrgActionResult = { ok: boolean; message: string };

function toSafeError(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to complete platform action. Please try again.";
    }
    return error.message;
  }
  return "Unable to complete platform action. Please try again.";
}

function asPositiveInt(value: FormDataEntryValue | null, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

function requireOrgId(formData: FormData): string {
  const id = String(formData.get("organizationId") || "").trim();
  if (!id) throw new Error("Organization id is required.");
  return id;
}

export async function suspendOrganizationAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const reason = String(formData.get("reason") || "").trim();
    await suspendOrganization({
      organizationId,
      actorUserId: user.id,
      reason,
    });
    revalidatePath("/platform/orgs");
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Organization suspended." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function unsuspendOrganizationAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    await unsuspendOrganization({
      organizationId,
      actorUserId: user.id,
    });
    revalidatePath("/platform/orgs");
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Organization unsuspended." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function updatePlatformUsagePolicyAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    await updateOrganizationUsagePolicyAsPlatform({
      organizationId,
      actorUserId: user.id,
      activeResearchedCompanyLimit: asPositiveInt(
        formData.get("activeResearchedCompanyLimit"),
        "Active researched company limit",
      ),
      dailyEmailGenerationLimit: asPositiveInt(
        formData.get("dailyEmailGenerationLimit"),
        "Daily AI email generation limit",
      ),
      dailyEmailSendWarningLimit: asPositiveInt(
        formData.get("dailyEmailSendWarningLimit"),
        "Daily send advisory threshold",
      ),
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Usage policy updated." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function grantOrganizationCreditAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const amountUsd = Number(formData.get("amountUsd"));
    const reason = String(formData.get("reason") || "").trim();
    const note = String(formData.get("note") || "").trim() || null;
    await grantOrganizationCredit({
      organizationId,
      actorUserId: user.id,
      amountUsd,
      reason,
      note,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Credit grant recorded." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}
