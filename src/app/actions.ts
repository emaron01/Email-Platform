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
  parseCampaignFormData,
  toSafeCampaignActionError,
  type CampaignActionResult,
} from "@/lib/campaign/save";
import {
  parseIcpFormData,
  toSafeIcpActionError,
  type IcpActionResult,
} from "@/lib/icp/save";
import {
  parseProductFormData,
  toSafeProductActionError,
  type ProductActionResult,
} from "@/lib/product/save";
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

export async function upsertProductAction(
  _prev: ProductActionResult | null,
  formData: FormData,
): Promise<ProductActionResult> {
  const values = (() => {
    try {
      return parseProductFormData(formData).values;
    } catch {
      return undefined;
    }
  })();

  try {
    const parsed = parseProductFormData(formData);
    if (Object.keys(parsed.fieldErrors).length > 0) {
      const firstField = Object.keys(parsed.fieldErrors)[0] as
        | keyof typeof parsed.fieldErrors
        | undefined;
      const firstMessage = firstField
        ? parsed.fieldErrors[firstField]
        : undefined;
      return {
        ok: false,
        message: firstMessage ?? "Please fix the highlighted fields.",
        values: parsed.values,
        fieldErrors: parsed.fieldErrors,
      };
    }

    const { id, fields } = parsed;
    let productId = id;
    if (id) {
      await updateProduct(id, fields);
      revalidateSetup(id);
      return { ok: true, message: "Product saved.", productId: id };
    }

    const product = await createProduct(fields);
    productId = product.id;
    revalidateSetup(productId);
    return {
      ok: true,
      message: "Product created.",
      productId,
    };
  } catch (error) {
    logActionError("Failed to save product.", error);
    return {
      ok: false,
      message: toSafeProductActionError(error),
      values,
    };
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

export async function upsertIcpAction(
  _prev: IcpActionResult | null,
  formData: FormData,
): Promise<IcpActionResult> {
  const values = (() => {
    try {
      return parseIcpFormData(formData).values;
    } catch {
      return undefined;
    }
  })();

  try {
    const parsed = parseIcpFormData(formData);
    if (Object.keys(parsed.fieldErrors).length > 0) {
      const firstField = Object.keys(parsed.fieldErrors)[0] as
        | keyof typeof parsed.fieldErrors
        | undefined;
      const firstMessage = firstField
        ? parsed.fieldErrors[firstField]
        : undefined;
      return {
        ok: false,
        message: firstMessage ?? "Please fix the highlighted fields.",
        productId: parsed.productId || undefined,
        values: parsed.values,
        fieldErrors: parsed.fieldErrors,
      };
    }

    const { id, productId, fields } = parsed;
    let icpId = id;
    if (id) {
      await updateIcp(id, fields);
    } else {
      const created = await createIcp({ ...fields, productId });
      icpId = created.id;
    }

    revalidateSetup(productId);
    return {
      ok: true,
      message: id ? "ICP saved." : "ICP created.",
      icpId,
      productId,
    };
  } catch (error) {
    logActionError("Failed to save ICP.", error);
    return {
      ok: false,
      message: toSafeIcpActionError(error),
      productId: values?.productId || undefined,
      values,
    };
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

export async function createCampaignAction(
  _prev: CampaignActionResult | null,
  formData: FormData,
): Promise<CampaignActionResult> {
  const values = (() => {
    try {
      return parseCampaignFormData(formData).values;
    } catch {
      return undefined;
    }
  })();

  try {
    const parsed = parseCampaignFormData(formData);
    if (Object.keys(parsed.fieldErrors).length > 0) {
      const firstField = Object.keys(parsed.fieldErrors)[0] as
        | keyof typeof parsed.fieldErrors
        | undefined;
      const firstMessage = firstField
        ? parsed.fieldErrors[firstField]
        : undefined;
      return {
        ok: false,
        message: firstMessage ?? "Please fix the highlighted fields.",
        values: parsed.values,
        fieldErrors: parsed.fieldErrors,
      };
    }

    const campaign = await createCampaign({
      ...parsed.fields,
      contactIds: parsed.contactIds,
    });
    revalidatePath("/campaigns");
    revalidatePath("/");
    return {
      ok: true,
      message: "Campaign created.",
      campaignId: campaign.id,
    };
  } catch (error) {
    logActionError("Failed to create campaign.", error);
    return {
      ok: false,
      message: toSafeCampaignActionError(error),
      values,
    };
  }
}
