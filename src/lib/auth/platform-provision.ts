/**
 * Next.js server-only boundary for platform SUPER_ADMIN provisioning.
 * Authoritative logic lives in platform-provision-service.ts (Node-safe).
 * The production CLI must import the service directly — not this module.
 */
import "server-only";

export {
  PLATFORM_BOOTSTRAP_CONFIRM_VALUE,
  PlatformProvisionError,
  assertPlatformProvisionConfirmation,
  provisionPlatformSuperAdmin,
  readPlatformProvisionEnv,
  signUpEmailViaBetterAuth,
  type PlatformProvisionEnv,
  type PlatformProvisionResult,
  type SignUpEmailFn,
} from "@/lib/auth/platform-provision-service";
