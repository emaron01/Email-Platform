/**
 * ICP form parsing and safe action results (Node-safe, no server-only).
 */

import { parseCommaList } from "@/lib/utils";
import { TenantError } from "@/lib/tenant/errors";

export type IcpActionResult = {
  ok: boolean;
  message: string;
  icpId?: string;
  productId?: string;
  /** Echo submitted values so the form can restore them after a failed save. */
  values?: IcpFormValues;
  fieldErrors?: Partial<Record<keyof IcpFormValues, string>>;
};

export type IcpFormValues = {
  id: string;
  productId: string;
  name: string;
  description: string;
  definition: string;
  additionalContext: string;
  targetIndustries: string;
  minEmployees: string;
  maxEmployees: string;
  minRevenue: string;
  maxRevenue: string;
  targetGeographies: string;
  requiredTechnologies: string;
  positiveSignals: string;
  negativeSignals: string;
  notes: string;
};

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function readIcpFormValues(formData: FormData): IcpFormValues {
  return {
    id: readString(formData, "id"),
    productId: readString(formData, "productId"),
    name: readString(formData, "name"),
    description: readString(formData, "description"),
    definition: readString(formData, "definition"),
    additionalContext: readString(formData, "additionalContext"),
    targetIndustries: readString(formData, "targetIndustries"),
    minEmployees: readString(formData, "minEmployees"),
    maxEmployees: readString(formData, "maxEmployees"),
    minRevenue: readString(formData, "minRevenue"),
    maxRevenue: readString(formData, "maxRevenue"),
    targetGeographies: readString(formData, "targetGeographies"),
    requiredTechnologies: readString(formData, "requiredTechnologies"),
    positiveSignals: readString(formData, "positiveSignals"),
    negativeSignals: readString(formData, "negativeSignals"),
    notes: readString(formData, "notes"),
  };
}

export function parseIcpFormData(formData: FormData): {
  id: string;
  productId: string;
  values: IcpFormValues;
  fields: {
    name: string;
    description: string | null;
    definition: string | null;
    additionalContext: string | null;
    targetIndustries: string[];
    minEmployees: number | null;
    maxEmployees: number | null;
    minRevenue: number | null;
    maxRevenue: number | null;
    targetGeographies: string[];
    requiredTechnologies: string[];
    positiveSignals: string[];
    negativeSignals: string[];
    notes: string | null;
  };
  fieldErrors: Partial<Record<keyof IcpFormValues, string>>;
} {
  const values = readIcpFormValues(formData);
  const fieldErrors: Partial<Record<keyof IcpFormValues, string>> = {};

  if (!values.productId) {
    fieldErrors.productId = "Product is required.";
  }
  if (!values.name) {
    fieldErrors.name = "ICP name is required.";
  }

  const minEmployees = toOptionalInt(values.minEmployees);
  const maxEmployees = toOptionalInt(values.maxEmployees);
  const minRevenue = toOptionalFloat(values.minRevenue);
  const maxRevenue = toOptionalFloat(values.maxRevenue);

  if (values.minEmployees && minEmployees == null) {
    fieldErrors.minEmployees = "Minimum employees must be a whole number.";
  }
  if (values.maxEmployees && maxEmployees == null) {
    fieldErrors.maxEmployees = "Maximum employees must be a whole number.";
  }
  if (values.minRevenue && minRevenue == null) {
    fieldErrors.minRevenue = "Minimum revenue must be a number.";
  }
  if (values.maxRevenue && maxRevenue == null) {
    fieldErrors.maxRevenue = "Maximum revenue must be a number.";
  }

  return {
    id: values.id,
    productId: values.productId,
    values,
    fieldErrors,
    fields: {
      name: values.name,
      description: values.description || null,
      definition: values.definition || null,
      additionalContext: values.additionalContext || null,
      targetIndustries: parseCommaList(values.targetIndustries),
      minEmployees,
      maxEmployees,
      minRevenue,
      maxRevenue,
      targetGeographies: parseCommaList(values.targetGeographies),
      requiredTechnologies: parseCommaList(values.requiredTechnologies),
      positiveSignals: parseCommaList(values.positiveSignals),
      negativeSignals: parseCommaList(values.negativeSignals),
      notes: values.notes || null,
    },
  };
}

export class IcpValidationError extends Error {
  readonly values: IcpFormValues;
  readonly fieldErrors: Partial<Record<keyof IcpFormValues, string>>;

  constructor(
    message: string,
    values: IcpFormValues,
    fieldErrors: Partial<Record<keyof IcpFormValues, string>>,
  ) {
    super(message);
    this.name = "IcpValidationError";
    this.values = values;
    this.fieldErrors = fieldErrors;
  }
}

/** Safe, user-facing error — never Prisma / stack / tenant ids. */
export function toSafeIcpActionError(error: unknown): string {
  if (error instanceof IcpValidationError) return error.message;
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return "An ICP with this name may already exist for this product.";
    }
    if (msg.includes("foreign key") || msg.includes("restrict")) {
      return "This ICP could not be saved because of a product relationship conflict.";
    }
  }
  return "Unable to save ICP. Please try again.";
}

function toOptionalInt(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function toOptionalFloat(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}
