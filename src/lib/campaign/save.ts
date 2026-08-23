/**
 * Campaign form parsing and safe action results (Node-safe, no server-only).
 */

import { TenantError } from "@/lib/tenant/errors";

export type CampaignActionResult = {
  ok: boolean;
  message: string;
  campaignId?: string;
  /** Echo submitted values so the form can restore them after a failed save. */
  values?: CampaignFormValues;
  fieldErrors?: Partial<Record<keyof CampaignFormValues, string>>;
};

export type CampaignFormValues = {
  name: string;
  productId: string;
  icpId: string;
  personaId: string;
  offerName: string;
  offerDescription: string;
  offerCta: string;
  offerNotes: string;
};

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function readCampaignFormValues(formData: FormData): CampaignFormValues {
  return {
    name: readString(formData, "name"),
    productId: readString(formData, "productId"),
    icpId: readString(formData, "icpId"),
    personaId: readString(formData, "personaId"),
    offerName: readString(formData, "offerName"),
    offerDescription: readString(formData, "offerDescription"),
    offerCta: readString(formData, "offerCta"),
    offerNotes: readString(formData, "offerNotes"),
  };
}

export function parseCampaignFormData(formData: FormData): {
  values: CampaignFormValues;
  contactIds: string[];
  fields: {
    name: string;
    productId: string;
    icpId: string;
    personaId: string;
    offerName: string | null;
    offerDescription: string | null;
    offerCta: string | null;
    offerNotes: string | null;
  };
  fieldErrors: Partial<Record<keyof CampaignFormValues, string>>;
} {
  const values = readCampaignFormValues(formData);
  const fieldErrors: Partial<Record<keyof CampaignFormValues, string>> = {};

  if (!values.name) fieldErrors.name = "Campaign name is required.";
  if (!values.productId) fieldErrors.productId = "Product is required.";
  if (!values.icpId) fieldErrors.icpId = "ICP is required.";
  if (!values.personaId) fieldErrors.personaId = "Persona is required.";

  const contactIds = formData
    .getAll("contactIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  return {
    values,
    contactIds,
    fieldErrors,
    fields: {
      name: values.name,
      productId: values.productId,
      icpId: values.icpId,
      personaId: values.personaId,
      offerName: values.offerName || null,
      offerDescription: values.offerDescription || null,
      offerCta: values.offerCta || null,
      offerNotes: values.offerNotes || null,
    },
  };
}

/** Safe, user-facing error — never Prisma / stack / tenant ids. */
export function toSafeCampaignActionError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return "A campaign with this name may already exist.";
    }
    if (msg.includes("foreign key") || msg.includes("restrict")) {
      return "This campaign could not be created because of a relationship conflict.";
    }
  }
  return "Unable to create campaign. Please try again.";
}
