import { createHash } from "node:crypto";
import type { RequiredMotionSpecific } from "@/lib/email-generation/motion-specifics";

export type FactSelectionCacheEntry = {
  specifics: RequiredMotionSpecific[];
  noneRelevant: boolean;
};

export type FactSelectionCacheKeyParts = {
  organizationId: string;
  companyId: string;
  productId: string;
  personaId: string;
  researchFingerprint: string;
  productFingerprint: string;
  personaFingerprint: string;
};

const cache = new Map<string, FactSelectionCacheEntry>();

export function fingerprintStringList(values: string[]): string {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return createHash("sha256")
    .update(normalized.join("\n"))
    .digest("hex")
    .slice(0, 16);
}

export function buildFactSelectionCacheKey(
  parts: FactSelectionCacheKeyParts,
): string {
  return [
    parts.organizationId,
    parts.companyId,
    parts.productId,
    parts.personaId,
    parts.researchFingerprint,
    parts.productFingerprint,
    parts.personaFingerprint,
  ].join("|");
}

export function getCachedFactSelection(
  key: string,
): FactSelectionCacheEntry | null {
  return cache.get(key) ?? null;
}

export function setCachedFactSelection(
  key: string,
  entry: FactSelectionCacheEntry,
): void {
  cache.set(key, entry);
}

/** Test helper — clears in-process fact-selection cache. */
export function clearFactSelectionCache(): void {
  cache.clear();
}

/**
 * Cache invalidation: any change to company research motion fields, product
 * problemsSolved, or persona painPoints/desiredOutcomes changes the fingerprint
 * segment of the key and misses the cache automatically.
 */
