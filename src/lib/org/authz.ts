/** @deprecated Import from `@/lib/auth/authz` — kept for compatibility. */
export {
  AuthorizationError,
  getCurrentUser,
  requireCurrentUser,
  canManageOrganizationPolicy,
  canManageInvitations,
  canRenameWorkspace,
  getMembershipForCurrentUser,
  requireOrgAdmin,
  requirePlatformOperator,
  requirePlatformSuperAdmin,
  requireVerifiedForAiSpend,
  isPlatformOperator,
  isPlatformSuperAdmin,
  canMutatePlatform,
  canEditTransactionalTemplates,
} from "@/lib/auth/authz";
