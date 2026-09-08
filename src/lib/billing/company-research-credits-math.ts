/**
 * Pure credit-pack math (no DB) — 12-month expiry, sum into effective allowance.
 */

export function sumActiveCreditCompanies(
  packs: ReadonlyArray<{ quantity: number; expiresAt: Date }>,
  now: Date = new Date(),
): number {
  return packs.reduce((sum, pack) => {
    if (pack.expiresAt.getTime() <= now.getTime()) return sum;
    return sum + pack.quantity;
  }, 0);
}

export function nextCreditExpiry(
  packs: ReadonlyArray<{ expiresAt: Date }>,
  now: Date = new Date(),
): Date | null {
  const active = packs
    .filter((pack) => pack.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  return active[0]?.expiresAt ?? null;
}

export function effectiveCompanyResearchLimit(
  baseLimit: number,
  packs: ReadonlyArray<{ quantity: number; expiresAt: Date }>,
  now: Date = new Date(),
): number {
  return baseLimit + sumActiveCreditCompanies(packs, now);
}
