/**
 * Next.js server-only boundary for transactional email config.
 * Authoritative logic lives in config-core.ts (Node-safe).
 */
import "server-only";

export {
  TransactionalEmailConfigError,
  formatFromAddress,
  getTransactionalEmailConfig,
  parseEnvBoolean,
  parseSmtpPort,
  type SmtpConfig,
  type TransactionalEmailConfig,
  type TransactionalEmailProviderName,
} from "@/lib/transactional-email/config-core";
