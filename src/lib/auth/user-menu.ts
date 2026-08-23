/**
 * Pure menu/nav model for authenticated users.
 * Platform-only SUPER_ADMIN (no Organization) is a first-class case.
 */
export type MembershipRoleForMenu = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type AuthenticatedNavInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  platformRole: "NONE" | "SUPER_ADMIN" | string;
  organizationName?: string | null;
  membershipRole?: MembershipRoleForMenu | null;
};

export type UserMenuLink = {
  href: string;
  label: string;
  /** Shown in tests / a11y as distinct action ids */
  id:
    | "account_settings"
    | "organization_settings"
    | "platform_admin"
    | "log_out";
};

export type UserMenuModel = {
  displayName: string | null;
  email: string;
  organizationName: string | null;
  platformRoleLabel: "SUPER_ADMIN" | null;
  showOrganizationSettings: boolean;
  showPlatformAdmin: boolean;
  /** Avatar / header initial — never invents an org name */
  avatarInitial: string;
  links: UserMenuLink[];
};

export type SidebarNavItem = {
  href: string;
  label: string;
};

export function displayNameFromUser(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): string | null {
  const fromParts = [input.firstName, input.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromParts) return fromParts;
  const name = input.name?.trim();
  return name || null;
}

function canManageOrgSettings(
  role: MembershipRoleForMenu | null | undefined,
): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Build the authenticated user-menu model.
 * Logout is always included when the menu is shown.
 */
export function buildUserMenuModel(
  input: AuthenticatedNavInput,
): UserMenuModel {
  const displayName = displayNameFromUser(input);
  const organizationName = input.organizationName?.trim() || null;
  const isSuperAdmin = input.platformRole === "SUPER_ADMIN";
  const showOrganizationSettings =
    Boolean(organizationName) &&
    canManageOrgSettings(input.membershipRole ?? null);
  const showPlatformAdmin = isSuperAdmin;

  const links: UserMenuLink[] = [
    {
      id: "account_settings",
      href: "/settings/account",
      label: "Account Settings",
    },
  ];

  if (showOrganizationSettings) {
    links.push({
      id: "organization_settings",
      href: "/settings",
      label: "Organization Settings",
    });
  }

  if (showPlatformAdmin) {
    links.push({
      id: "platform_admin",
      href: "/platform/email-templates",
      label: "Platform Administration",
    });
  }

  links.push({
    id: "log_out",
    href: "#logout",
    label: "Log Out",
  });

  const avatarSource = displayName || input.email || "?";
  return {
    displayName,
    email: input.email,
    organizationName,
    platformRoleLabel: isSuperAdmin ? "SUPER_ADMIN" : null,
    showOrganizationSettings,
    showPlatformAdmin,
    avatarInitial: avatarSource.slice(0, 1).toUpperCase(),
    links,
  };
}

/**
 * Sidebar items for the current identity.
 * Platform-only SUPER_ADMIN does not get fake customer workspace links.
 */
export function buildSidebarNavItems(input: {
  hasOrganization: boolean;
  isSuperAdmin: boolean;
}): SidebarNavItem[] {
  if (!input.hasOrganization) {
    const items: SidebarNavItem[] = [
      { href: "/settings/account", label: "Account" },
    ];
    if (input.isSuperAdmin) {
      items.unshift({
        href: "/platform/email-templates",
        label: "Platform",
      });
    }
    return items;
  }

  const items: SidebarNavItem[] = [
    { href: "/", label: "Dashboard" },
    { href: "/setup", label: "Setup" },
    { href: "/lists", label: "Lists" },
    { href: "/contacts", label: "Contacts" },
    { href: "/campaigns", label: "Campaigns" },
    { href: "/settings/voice", label: "Your Voice" },
    { href: "/settings", label: "Settings" },
    { href: "/settings/account", label: "Account" },
  ];
  if (input.isSuperAdmin) {
    items.push({
      href: "/platform/email-templates",
      label: "Platform",
    });
  }
  return items;
}
