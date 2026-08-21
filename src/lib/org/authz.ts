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
  requirePlatformSuperAdmin,
  requireVerifiedForAiSpend,
  isPlatformSuperAdmin,
  canEditTransactionalTemplates,
} from "@/lib/auth/authz";
