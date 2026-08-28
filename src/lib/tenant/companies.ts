/**
 * Next.js server-only boundary for company + research tenant operations.
 * Workers import `@/lib/tenant/company-research-service` instead.
 */
import "server-only";

export * from "@/lib/tenant/company-research-service";
