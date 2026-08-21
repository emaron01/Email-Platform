"use server";

import { revalidatePath } from "next/cache";
import { interpretIcpDefinition, updateIcpCriterionManual } from "@/lib/interpretation/icp";
import {
  interpretPersonaDefinition,
  updatePersonaCriterionManual,
} from "@/lib/interpretation/persona";
import { getCurrentUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

function revalidateSetup(productId?: string) {
  revalidatePath("/setup");
  if (productId) revalidatePath(`/setup/${productId}`);
}

export async function interpretIcpAction(formData: FormData): Promise<void> {
  const organizationId = await requireOrganizationId();
  const user = await getCurrentUser();
  const icpId = String(formData.get("icpId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!icpId) throw new TenantError("ICP id is required.");

  await interpretIcpDefinition({
    organizationId,
    icpId,
    userId: user?.id ?? null,
  });
  revalidateSetup(productId || undefined);
}

export async function interpretPersonaAction(formData: FormData): Promise<void> {
  const organizationId = await requireOrganizationId();
  const user = await getCurrentUser();
  const personaId = String(formData.get("personaId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!personaId) throw new TenantError("Persona id is required.");

  await interpretPersonaDefinition({
    organizationId,
    personaId,
    userId: user?.id ?? null,
  });
  revalidateSetup(productId || undefined);
}

export async function updateIcpCriterionAction(formData: FormData): Promise<void> {
  const organizationId = await requireOrganizationId();
  const criterionId = String(formData.get("criterionId") || "").trim();
  const icpId = String(formData.get("icpId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!criterionId || !icpId) {
    throw new TenantError("ICP criterion id and icp id are required.");
  }

  const name = String(formData.get("name") || "").trim();
  await updateIcpCriterionManual({
    organizationId,
    icpId,
    criterionId,
    data: {
      ...(name ? { name } : {}),
      description: String(formData.get("description") || "") || null,
      isRequired: formData.get("isRequired") === "on" || formData.get("isRequired") === "true",
      isDisqualifier:
        formData.get("isDisqualifier") === "on" ||
        formData.get("isDisqualifier") === "true",
    },
  });
  revalidateSetup(productId || undefined);
}

export async function updatePersonaCriterionAction(
  formData: FormData,
): Promise<void> {
  const organizationId = await requireOrganizationId();
  const criterionId = String(formData.get("criterionId") || "").trim();
  const personaId = String(formData.get("personaId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!criterionId || !personaId) {
    throw new TenantError("Persona criterion id and persona id are required.");
  }

  const name = String(formData.get("name") || "").trim();
  await updatePersonaCriterionManual({
    organizationId,
    personaId,
    criterionId,
    data: {
      ...(name ? { name } : {}),
      description: String(formData.get("description") || "") || null,
      isRequired: formData.get("isRequired") === "on" || formData.get("isRequired") === "true",
      isDisqualifier:
        formData.get("isDisqualifier") === "on" ||
        formData.get("isDisqualifier") === "true",
    },
  });
  revalidateSetup(productId || undefined);
}
