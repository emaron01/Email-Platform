export const CONTACT_FIELD_KEYS = [
  "firstName",
  "lastName",
  "email",
  "title",
  "company",
  "companyWebsite",
  "industry",
  "employeeCount",
  "revenue",
  "location",
  "linkedinUrl",
  "phone",
] as const;

export type ContactFieldKey = (typeof CONTACT_FIELD_KEYS)[number];

export type MappedDestination = ContactFieldKey | "ignore";

export const CONTACT_FIELD_LABELS: Record<ContactFieldKey, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  title: "Title",
  company: "Company",
  companyWebsite: "Company Website",
  industry: "Industry",
  employeeCount: "Employee Count",
  revenue: "Revenue",
  location: "Location",
  linkedinUrl: "LinkedIn URL",
  phone: "Phone",
};

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  delimiter?: string;
  sheetNames?: string[];
  activeSheet?: string;
  errors: string[];
};

export type ColumnMapping = Record<string, MappedDestination>;

export type PreparedContact = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  companyWebsite: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: number | null;
  location: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  rawData: Record<string, string>;
};

export type RowIssue = {
  rowNumber: number;
  level: "warning" | "error";
  message: string;
};

export type ValidatedRow = {
  rowNumber: number;
  contact: PreparedContact;
  issues: RowIssue[];
  status: "valid" | "warning" | "invalid";
};

export type DuplicateMode = "skip" | "import";

export type ImportSourceType = "PASTE" | "UPLOAD";
