/**
 * Calendar-day helpers for Organization-scoped daily quotas.
 * Daily windows use the Organization IANA timezone, not server UTC alone.
 */

export function getOrganizationDayKey(
  timezone: string,
  at: Date = new Date(),
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Invalid timezone — fall through to UTC.
  }

  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDayWindowUtcBounds(
  timezone: string,
  dayKey: string,
): { start: Date; end: Date } {
  // Approximate: interpret dayKey midnight in timezone via iterative offset.
  // For quota counting we primarily use periodKey on the ledger; bounds are
  // for UsageEvent aggregation windows.
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  const keyAtGuess = getOrganizationDayKey(timezone, guess);
  let start = new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0));

  // Walk backward/forward to find first instant of dayKey in that TZ.
  for (let hour = -36; hour <= 36; hour += 1) {
    const candidate = new Date(Date.UTC(y!, m! - 1, d!, hour, 0, 0));
    if (getOrganizationDayKey(timezone, candidate) === dayKey) {
      start = candidate;
      break;
    }
  }

  // Find end: first hour of next calendar day in TZ.
  let end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  for (let ms = 0; ms < 48 * 60 * 60 * 1000; ms += 60 * 60 * 1000) {
    const candidate = new Date(start.getTime() + ms);
    if (getOrganizationDayKey(timezone, candidate) !== dayKey) {
      end = candidate;
      break;
    }
  }

  void keyAtGuess;
  return { start, end };
}
