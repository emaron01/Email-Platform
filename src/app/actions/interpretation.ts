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
import {
  parsePersonaFormData,
  toSafePersonaActionError,
  type PersonaActionResult,
} from "@/lib/persona/save";
import { createPersona, updatePersona } from "@/lib/tenant/data";
import { prisma } from "@/lib/prisma";

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

/**
 * Save authoritative Persona fields first, then interpret.
 * AI failure never rolls back a successful save.
 */
export async function saveAndInterpretPersonaAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  let personaId = "";
  let productId = "";

  try {
    const parsed = parsePersonaFormData(formData);
    productId = parsed.productId;
    personaId = parsed.id;

    if (personaId) {
      await updatePersona(personaId, parsed.fields);
    } else {
      const created = await createPersona({
        ...parsed.fields,
        productId: parsed.productId,
      });
      personaId = created.id;
    }
  } catch (error) {
    return { ok: false, message: toSafePersonaActionError(error) };
  }

  try {
    const organizationId = await requireOrganizationId();
    const user = await getCurrentUser();
    await interpretPersonaDefinition({
      organizationId,
      personaId,
      userId: user?.id ?? null,
    });
    revalidateSetup(productId || undefined);
    return {
      ok: true,
      message: "Persona saved. Interpretation complete.",
      personaId,
    };
  } catch (error) {
    revalidateSetup(productId || undefined);
    console.error(
      "[persona] interpretation failed after save",
      error instanceof Error ? error.message.slice(0, 300) : "unknown",
    );
    return {
      ok: true,
      message:
        "Persona saved. AI interpretation could not be completed. You can retry Interpret / Reinterpret later.",
      personaId,
    };
  }
}

/** Reinterpret only (persona must already exist). Saves are preferred via saveAndInterpret. */
export async function interpretPersonaAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  const organizationId = await requireOrganizationId();
  const user = await getCurrentUser();
  const personaId = String(formData.get("personaId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!personaId) {
    return { ok: false, message: "Save the persona before interpreting." };
  }

  try {
    await interpretPersonaDefinition({
      organizationId,
      personaId,
      userId: user?.id ?? null,
    });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Interpretation complete.", personaId };
  } catch (error) {
    console.error(
      "[persona] interpretation failed",
      error instanceof Error ? error.message.slice(0, 300) : "unknown",
    );
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "AI interpretation could not be completed. Persona data was not changed.",
      personaId,
    };
  }
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

  const role = String(formData.get("role") || "").trim();
  let isRequired = formData.get("isRequired") === "on" || formData.get("isRequired") === "true";
  let isDisqualifier =
    formData.get("isDisqualifier") === "on" ||
    formData.get("isDisqualifier") === "true";
  let criterionType: string | undefined;

  if (role === "required") {
    isRequired = true;
    isDisqualifier = false;
    criterionType = "positive_role_signal";
  } else if (role === "supporting") {
    isRequired = false;
    isDisqualifier = false;
    criterionType = "positive_role_signal";
  } else if (role === "disqualifier") {
    isRequired = false;
    isDisqualifier = true;
    criterionType = "negative_role_signal";
  }

  const existing = await prisma.personaCriterion.findFirst({
    where: { id: criterionId, organizationId, personaId },
    select: { criterionType: true },
  });
  const promoteFromNeedsReview =
    existing?.criterionType.trim().toLowerCase() === "needs_review" &&
    Boolean(criterionType);

  const name = String(formData.get("name") || "").trim();
  await updatePersonaCriterionManual({
    organizationId,
    personaId,
    criterionId,
    data: {
      ...(name ? { name } : {}),
      description: String(formData.get("description") || "") || null,
      isRequired,
      isDisqualifier,
      ...(promoteFromNeedsReview && criterionType
        ? { criterionType }
        : {}),
    },
  });
  revalidateSetup(productId || undefined);
}

export async function deletePersonaCriterionAction(
  formData: FormData,
): Promise<void> {
  const organizationId = await requireOrganizationId();
  const criterionId = String(formData.get("criterionId") || "").trim();
  const personaId = String(formData.get("personaId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!criterionId || !personaId) {
    throw new TenantError("Persona criterion id and persona id are required.");
  }

  const existing = await prisma.personaCriterion.findFirst({
    where: { id: criterionId, organizationId, personaId },
  });
  if (!existing) {
    throw new TenantError(
      "Persona criterion not found in the active organization.",
    );
  }

  await prisma.personaCriterion.delete({ where: { id: existing.id } });
  revalidateSetup(productId || undefined);
}
