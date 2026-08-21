/**
 * Next.js server-only boundary for auth env.
 * Authoritative logic lives in config-core.ts (Node-safe).
 */
import "server-only";

export {
  getAuthEnv,
  isDevTenantBypassEnabled,
  type AuthEnv,
} from "@/lib/auth/config-core";
