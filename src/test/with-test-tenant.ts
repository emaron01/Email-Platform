import { runWithTenantContext } from "@/lib/tenant/request-context";

/**
 * Run tenant-scoped service code the same way the research worker does:
 * AsyncLocalStorage organization id — not NEXT_RUNTIME / DEV_ORGANIZATION_ID.
 */
export function withTestTenant<T>(
  organizationId: string,
  fn: () => Promise<T>,
  userId?: string | null,
): Promise<T> {
  return runWithTenantContext({ organizationId, userId }, fn);
}
