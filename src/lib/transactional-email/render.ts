/**
 * Next.js server-only boundary for transactional email rendering.
 * Authoritative logic lives in render-service.ts (Node-safe).
 */
import "server-only";

export {
  TemplateRenderError,
  renderTransactionalTemplate,
  validateTemplateContent,
  type RenderedTransactionalEmail,
} from "@/lib/transactional-email/render-service";
