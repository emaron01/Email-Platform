/** Every /platform route that must be reachable from console nav (directly or via Orgs). */
export const PLATFORM_ROUTE_AUDIT = [
  "/platform",
  "/platform/orgs",
  "/platform/orgs/new",
  "/platform/orgs/[id]",
  "/platform/orgs/[id]/view",
  "/platform/costs",
  "/platform/email-templates",
] as const;
