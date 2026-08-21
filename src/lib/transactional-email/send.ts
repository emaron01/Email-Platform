/**
 * Next.js server-only boundary for transactional email send.
 * Authoritative logic lives in send-service.ts (Node-safe).
 */
import "server-only";

export {
  sendTransactionalEmail,
  verifyTransactionalEmailProvider,
} from "@/lib/transactional-email/send-service";

export type { TransactionalEmailProvider } from "@/lib/transactional-email/providers";
export { getTransactionalEmailProvider } from "@/lib/transactional-email/providers";
