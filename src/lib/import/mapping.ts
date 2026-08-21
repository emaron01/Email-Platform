import {
  CONTACT_FIELD_KEYS,
  type ColumnMapping,
  type ContactFieldKey,
  type MappedDestination,
} from "@/lib/import/types";

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[%$#]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ALIASES: Record<ContactFieldKey, string[]> = {
  firstName: [
    "first name",
    "firstname",
    "first",
    "given name",
    "givenname",
    "fname",
  ],
  lastName: [
    "last name",
    "lastname",
    "last",
    "surname",
    "family name",
    "lname",
  ],
  email: [
    "email",
    "email address",
    "e mail",
    "work email",
    "emailaddress",
  ],
  title: [
    "title",
    "job title",
    "jobtitle",
    "position",
    "role",
  ],
  company: [
    "company",
    "company name",
    "companyname",
    "account",
    "account name",
    "organization",
    "org",
  ],
  companyWebsite: [
    "company website",
    "website",
    "company url",
    "companyurl",
    "domain",
    "company domain",
    "website url",
  ],
  industry: ["industry", "sector", "vertical"],
  employeeCount: [
    "employee count",
    "employees",
    "employee",
    "company size",
    "companysize",
    "headcount",
    "num employees",
    "number of employees",
    "size",
  ],
  revenue: [
    "revenue",
    "annual revenue",
    "arr",
    "company revenue",
    "estimated revenue",
  ],
  location: [
    "location",
    "city",
    "region",
    "state",
    "country",
    "hq location",
    "headquarters",
  ],
  linkedinUrl: [
    "linkedin",
    "linkedin url",
    "linkedinurl",
    "linkedin profile",
    "li url",
  ],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "cellphone",
    "work phone",
    "telephone",
  ],
};

export function suggestDestination(header: string): MappedDestination {
  const normalized = normalizeHeader(header);
  if (!normalized) return "ignore";

  for (const key of CONTACT_FIELD_KEYS) {
    if (ALIASES[key].includes(normalized)) {
      return key;
    }
  }

  // Soft contains matches for common variants
  if (normalized.includes("email")) return "email";
  if (normalized.includes("linkedin")) return "linkedinUrl";
  if (normalized.includes("employee") || normalized.includes("headcount")) {
    return "employeeCount";
  }
  if (normalized.includes("revenue") || normalized === "arr") return "revenue";
  if (normalized.includes("website") || normalized.includes("domain")) {
    return "companyWebsite";
  }
  if (normalized === "first" || normalized.startsWith("first ")) return "firstName";
  if (normalized === "last" || normalized.startsWith("last ")) return "lastName";

  return "ignore";
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ContactFieldKey>();

  for (const header of headers) {
    const suggestion = suggestDestination(header);
    if (suggestion === "ignore") {
      mapping[header] = "ignore";
      continue;
    }

    if (used.has(suggestion)) {
      mapping[header] = "ignore";
      continue;
    }

    mapping[header] = suggestion;
    used.add(suggestion);
  }

  return mapping;
}

export function assertUniqueFieldMappings(
  mapping: ColumnMapping,
): { ok: true } | { ok: false; error: string } {
  const seen = new Map<ContactFieldKey, string>();

  for (const [header, destination] of Object.entries(mapping)) {
    if (destination === "ignore") continue;
    const previous = seen.get(destination);
    if (previous) {
      return {
        ok: false,
        error: `"${destination}" is mapped from both "${previous}" and "${header}".`,
      };
    }
    seen.set(destination, header);
  }

  return { ok: true };
}
