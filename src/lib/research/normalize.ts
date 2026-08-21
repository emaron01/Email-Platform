/**
 * Normalization helpers for company identity matching.
 * Matching priority: normalizedDomain → exact normalizedName.
 * No aggressive fuzzy merging.
 */

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split("/")[0] ?? "";
  value = value.split("?")[0] ?? "";
  value = value.split("#")[0] ?? "";
  value = value.replace(/:\d+$/, "");
  value = value.trim();

  if (!value || !value.includes(".")) return null;
  // Reject emails mistaken as domains when full email passed
  if (value.includes("@")) {
    const host = value.split("@").pop() ?? "";
    return normalizeDomain(host);
  }

  return value || null;
}

export function normalizeWebsiteUrl(
  input: string | null | undefined,
): string | null {
  const domain = normalizeDomain(input);
  if (!domain) return null;
  return `https://${domain}`;
}

export function normalizeCompanyName(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  value = value
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const suffixes = [
    "incorporated",
    "corporation",
    "company",
    "limited",
    "inc",
    "corp",
    "ltd",
    "llc",
    "llp",
    "co",
    "plc",
  ];

  for (const suffix of suffixes) {
    const re = new RegExp(`\\b${suffix}\\b\\.?\s*$`, "i");
    value = value.replace(re, "").trim();
  }

  return value || null;
}

export function domainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  return normalizeDomain(email.slice(at + 1));
}
