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

export async function deleteProductAction(formData: FormData): Promise<void> {
  try {
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError("Product id is required.");
    await deleteProduct(id);
    revalidateSetup();
  } catch (error) {
    logActionError("Failed to delete product.", error);
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

export async function deleteIcpAction(formData: FormData): Promise<void> {
  try {
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    if (!id) throw new TenantError("ICP id is required.");
    await deleteIcp(id);
    revalidateSetup(productId || undefined);
  } catch (error) {
    logActionError("Failed to delete ICP.", error);
  }
}

export async function upsertPersonaAction(formData: FormData): Promise<void> {
  try {
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    const name = requiredString(formData, "name");
    if (!productId) throw new TenantError("Product is required.");
    if (!name) throw new TenantError("Persona name is required.");

    const data = {
      name,
      definition: requiredString(formData, "definition") || null,
      additionalContext: requiredString(formData, "additionalContext") || null,
      targetTitles: parseCommaList(requiredString(formData, "targetTitles")),
      department: requiredString(formData, "department") || null,
      seniority: requiredString(formData, "seniority") || null,
      responsibilities: requiredString(formData, "responsibilities") || null,
      painPoints: requiredString(formData, "painPoints") || null,
      desiredOutcomes: requiredString(formData, "desiredOutcomes") || null,
      messagingNotes: requiredString(formData, "messagingNotes") || null,
    };

    if (id) {
      await updatePersona(id, data);
    } else {
      await createPersona({ ...data, productId });
    }

    revalidateSetup(productId);
  } catch (error) {
    logActionError("Failed to save persona.", error);
  }
}

export async function deletePersonaAction(formData: FormData): Promise<void> {
  try {
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    if (!id) throw new TenantError("Persona id is required.");
    await deletePersona(id);
    revalidateSetup(productId || undefined);
  } catch (error) {
    logActionError("Failed to delete persona.", error);
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
