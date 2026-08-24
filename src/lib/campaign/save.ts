/**
 * Campaign form parsing and safe action results (Node-safe, no server-only).
 */

import { TenantError } from "@/lib/tenant/errors";

export const EMAIL_LENGTH_OPTIONS = [
  "ONE_PARAGRAPH",
  "TWO_PARAGRAPH",
  "THREE_PARAGRAPH",
] as const;
export type CampaignEmailLength = (typeof EMAIL_LENGTH_OPTIONS)[number];
export const DEFAULT_EMAIL_LENGTH: CampaignEmailLength = "TWO_PARAGRAPH";
export const EMAIL_GUIDANCE_MAX_CHARS = 500;

export type CampaignActionResult = {
  ok: boolean;
  message: string;
  campaignId?: string;
  /** Echo submitted values so the form can restore them after a failed save. */
  values?: CampaignFormValues;
  fieldErrors?: Partial<Record<keyof CampaignFormValues, string>>;
};

export type CampaignEmailSettingsValues = {
  emailLength: string;
  emailGuidance: string;
};

export type CampaignEmailSettingsActionResult = {
  ok: boolean;
  message: string;
  values?: CampaignEmailSettingsValues;
  fieldErrors?: Partial<Record<keyof CampaignEmailSettingsValues, string>>;
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
  emailLength: string;
  emailGuidance: string;
};

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function parseCampaignEmailSettingsFormData(formData: FormData): {
  values: CampaignEmailSettingsValues;
  fields: {
    emailLength: CampaignEmailLength;
    emailGuidance: string | null;
  };
  fieldErrors: Partial<Record<keyof CampaignEmailSettingsValues, string>>;
} {
  const values = {
    emailLength: readString(formData, "emailLength") || DEFAULT_EMAIL_LENGTH,
    emailGuidance: readString(formData, "emailGuidance"),
  };
  const fieldErrors: Partial<
    Record<keyof CampaignEmailSettingsValues, string>
  > = {};
  const emailLength = EMAIL_LENGTH_OPTIONS.includes(
    values.emailLength as CampaignEmailLength,
  )
    ? (values.emailLength as CampaignEmailLength)
    : DEFAULT_EMAIL_LENGTH;

  if (emailLength !== values.emailLength) {
    fieldErrors.emailLength = "Select a valid email length.";
  }
  if (values.emailGuidance.length > EMAIL_GUIDANCE_MAX_CHARS) {
    fieldErrors.emailGuidance = `Email guidance must be ${EMAIL_GUIDANCE_MAX_CHARS} characters or fewer.`;
  }

  return {
    values,
    fields: {
      emailLength,
      emailGuidance: values.emailGuidance || null,
    },
    fieldErrors,
  };
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
    emailLength: readString(formData, "emailLength") || DEFAULT_EMAIL_LENGTH,
    emailGuidance: readString(formData, "emailGuidance"),
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
    emailLength: CampaignEmailLength;
    emailGuidance: string | null;
  };
  fieldErrors: Partial<Record<keyof CampaignFormValues, string>>;
} {
  const values = readCampaignFormValues(formData);
  const fieldErrors: Partial<Record<keyof CampaignFormValues, string>> = {};

  if (!values.name) fieldErrors.name = "Campaign name is required.";
  if (!values.productId) fieldErrors.productId = "Product is required.";
  if (!values.icpId) fieldErrors.icpId = "ICP is required.";
  if (!values.personaId) fieldErrors.personaId = "Persona is required.";
  const emailSettings = parseCampaignEmailSettingsFormData(formData);
  Object.assign(fieldErrors, emailSettings.fieldErrors);

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
      emailLength: emailSettings.fields.emailLength,
      emailGuidance: emailSettings.fields.emailGuidance,
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
