/**
 * Next.js server-only boundary for workspace provisioning.
 * Authoritative logic lives in provision-service.ts (Node-safe).
 */
import "server-only";

export {
  ProvisionError,
  normalizeEmail,
  provisionIndividualWorkspace,
} from "@/lib/auth/provision-service";
