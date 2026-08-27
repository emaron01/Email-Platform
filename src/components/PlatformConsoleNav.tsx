"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PlatformRole } from "@prisma/client";

const PLATFORM_NAV_ITEMS = [
  { href: "/platform", label: "Home", match: "exact" as const },
  { href: "/platform/orgs", label: "Organizations", match: "prefix" as const },
  { href: "/platform/costs", label: "Costs & margin", match: "exact" as const },
  {
    href: "/platform/email-templates",
    label: "Email templates",
    match: "exact" as const,
    superAdminOnly: true,
  },
] as const;

function itemsForRole(platformRole: PlatformRole) {
  return PLATFORM_NAV_ITEMS.filter(
    (item) =>
      !("superAdminOnly" in item && item.superAdminOnly) ||
      platformRole === "SUPER_ADMIN",
  );
}

/** Every /platform route that must be reachable from console nav (directly or via Orgs). */
export const PLATFORM_ROUTE_AUDIT = [
  "/platform",
  "/platform/orgs",
  "/platform/orgs/new",
  "/platform/orgs/[id]",
  "/platform/orgs/[id]/view",
  "/platform/costs",
  "/platform/email-templates",
] as const;

export function PlatformConsoleNav({
  platformRole,
}: {
  platformRole: PlatformRole;
}) {
  const pathname = usePathname() || "/platform";
  const items = itemsForRole(platformRole);

  return (
    <nav
      aria-label="Platform console"
      className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-3 text-sm"
      data-testid="platform-console-nav"
    >
      {items.map((item) => {
        const active =
          item.match === "exact"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-1.5 font-medium ${
              active
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
