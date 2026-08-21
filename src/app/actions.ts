"use server";

import { revalidatePath } from "next/cache";
import {
  createCampaign,
  createIcp,
  createPersona,
  createProduct,
  deleteIcp,
  deletePersona,
  deleteProduct,
  updateIcp,
  updatePersona,
  updateProduct,
} from "@/lib/tenant/data";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import {
  parseCommaList,
  toOptionalFloat,
  toOptionalInt,
} from "@/lib/utils";
import {
  parsePersonaFormData,
  toSafePersonaActionError,
  type PersonaActionResult,
} from "@/lib/persona/save";
import {
  toSafeCrudDeleteError,
  type CrudDeleteResult,
} from "@/lib/tenant/crud-delete";
import { requireSetupDeletePermission } from "@/lib/auth/authz";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function logActionError(fallback: string, error: unknown): void {
  if (error instanceof TenantError) {
    console.error(fallback, error.message);
    return;
  }
  console.error(fallback, error);
}

function revalidateSetup(productId?: string) {
  revalidatePath("/setup");
  if (productId) revalidatePath(`/setup/${productId}`);
  revalidatePath("/campaigns");
  revalidatePath("/");
}

export async function upsertProductAction(formData: FormData): Promise<void> {
  try {
    const id = requiredString(formData, "id");
    const name = requiredString(formData, "name");
    if (!name) throw new TenantError("Product name is required.");

    const data = {
      name,
      description: requiredString(formData, "description") || null,
      valueProposition: requiredString(formData, "valueProposition") || null,
      averageOrderValue: toOptionalFloat(formData.get("averageOrderValue")),
      websiteUrl: requiredString(formData, "websiteUrl") || null,
    };

    if (id) {
      await updateProduct(id, data);
      revalidateSetup(id);
    } else {
      const product = await createProduct(data);
      revalidateSetup(product.id);
    }
  } catch (error) {
    logActionError("Failed to save product.", error);
  }
}

export async function deleteProductAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    await requireSetupDeletePermission();
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError("Product id is required.");
    const confirmed = requiredString(formData, "confirm") === "1";
    if (!confirmed) {
      return {
        ok: false,
        message: "Confirm deletion before continuing.",
      };
    }
    const result = await deleteProduct(id);
    revalidateSetup();
    return {
      ok: true,
      message: result.message,
      mode: result.mode,
      productId: id,
    };
  } catch (error) {
    logActionError("Failed to delete product.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function upsertIcpAction(formData: FormData): Promise<void> {
  try {
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    const name = requiredString(formData, "name");
    if (!productId) throw new TenantError("Product is required.");
    if (!name) throw new TenantError("ICP name is required.");

    const data = {
      name,
      description: requiredString(formData, "description") || null,
      definition: requiredString(formData, "definition") || null,
      additionalContext: requiredString(formData, "additionalContext") || null,
      targetIndustries: parseCommaList(
        requiredString(formData, "targetIndustries"),
      ),
      minEmployees: toOptionalInt(formData.get("minEmployees")),
      maxEmployees: toOptionalInt(formData.get("maxEmployees")),
      minRevenue: toOptionalFloat(formData.get("minRevenue")),
      maxRevenue: toOptionalFloat(formData.get("maxRevenue")),
      targetGeographies: parseCommaList(
        requiredString(formData, "targetGeographies"),
      ),
      requiredTechnologies: parseCommaList(
        requiredString(formData, "requiredTechnologies"),
      ),
      positiveSignals: parseCommaList(
        requiredString(formData, "positiveSignals"),
      ),
      negativeSignals: parseCommaList(
        requiredString(formData, "negativeSignals"),
      ),
      notes: requiredString(formData, "notes") || null,
    };

    if (id) {
      await updateIcp(id, data);
    } else {
      await createIcp({ ...data, productId });
    }

    revalidateSetup(productId);
  } catch (error) {
    logActionError("Failed to save ICP.", error);
  }
}

export async function deleteIcpAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    await requireSetupDeletePermission();
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    if (!id) throw new TenantError("ICP id is required.");
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm deletion before continuing." };
    }
    const result = await deleteIcp(id);
    revalidateSetup(productId || undefined);
    return { ok: true, message: result.message, mode: result.mode };
  } catch (error) {
    logActionError("Failed to delete ICP.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function upsertPersonaAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  try {
    const { id, productId, fields } = parsePersonaFormData(formData);

    let personaId = id;
    if (id) {
      await updatePersona(id, fields);
    } else {
      const created = await createPersona({ ...fields, productId });
      personaId = created.id;
    }

    revalidateSetup(productId);
    return {
      ok: true,
      message: "Persona saved.",
      personaId,
    };
  } catch (error) {
    logActionError("Failed to save persona.", error);
    return { ok: false, message: toSafePersonaActionError(error) };
  }
}

export async function deletePersonaAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    await requireSetupDeletePermission();
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    if (!id) throw new TenantError("Persona id is required.");
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm deletion before continuing." };
    }
    const result = await deletePersona(id);
    revalidateSetup(productId || undefined);
    return {
      ok: true,
      message: result.message,
      mode: result.mode,
      personaId: id,
      productId: productId || undefined,
    };
  } catch (error) {
    logActionError("Failed to delete persona.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  try {
    const name = requiredString(formData, "name");
    const productId = requiredString(formData, "productId");
    const icpId = requiredString(formData, "icpId");
    const personaId = requiredString(formData, "personaId");

    if (!name || !productId || !icpId || !personaId) {
      throw new TenantError(
        "Campaign name, product, ICP, and persona are required.",
      );
    }

    const contactIds = formData
      .getAll("contactIds")
      .map((value) => String(value).trim())
      .filter(Boolean);

    await createCampaign({
      name,
      productId,
      icpId,
      personaId,
      offerName: requiredString(formData, "offerName") || null,
      offerDescription: requiredString(formData, "offerDescription") || null,
      offerCta: requiredString(formData, "offerCta") || null,
      offerNotes: requiredString(formData, "offerNotes") || null,
      contactIds,
    });
    revalidatePath("/campaigns");
    revalidatePath("/");
  } catch (error) {
    logActionError("Failed to create campaign.", error);
  }
}
