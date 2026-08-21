export function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function listToCommaString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

export function toOptionalInt(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toOptionalFloat(
  value: FormDataEntryValue | null,
): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function contactDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
