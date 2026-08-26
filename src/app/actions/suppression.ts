"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import { toSafeCrudDeleteError, type CrudDeleteResult } from "@/lib/tenant/crud-delete";
import {
  releaseContactById,
  suppressContactById,
} from "@/lib/suppression/service";

function logActionError(fallback: string, error: unknown): void {
  if (error instanceof TenantError) {
    console.error(fallback, error.message);
    return;
  }
  console.error(fallback, error);
}

function revalidateContactSurfaces(): void {
  revalidatePath("/lists");
  revalidatePath("/contacts");
  revalidatePath("/campaigns");
  revalidatePath("/scoring");
  revalidatePath("/");
}

export async function suppressContactAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!contactId) throw new TenantError("Contact id is required.");
    if (String(formData.get("confirm") ?? "") !== "1") {
      return { ok: false, message: "Confirm opt-out before continuing." };
    }
    await suppressContactById({
      organizationId,
      contactId,
      actorUserId: user.id,
      reason: "OPTED_OUT",
    });
    revalidateContactSurfaces();
    return {
      ok: true,
      message:
        "Contact opted out for this organization. They will not be emailed until restored.",
    };
  } catch (error) {
    logActionError("Failed to opt out contact.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function releaseContactAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!contactId) throw new TenantError("Contact id is required.");
    if (String(formData.get("confirm") ?? "") !== "1") {
      return { ok: false, message: "Confirm restore before continuing." };
    }
    await releaseContactById({
      organizationId,
      contactId,
      actorUserId: user.id,
    });
    revalidateContactSurfaces();
    return {
      ok: true,
      message: "Contact restored. They can be scored and emailed again.",
    };
  } catch (error) {
    logActionError("Failed to restore contact.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}
