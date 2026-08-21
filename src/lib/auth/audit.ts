/**
 * Next.js server-only boundary for admin audit.
 * Authoritative logic lives in audit-service.ts (Node-safe).
 */
import "server-only";

export {
  recordAdminAuditEvent,
  sanitizeAuditMetadata,
} from "@/lib/auth/audit-service";
