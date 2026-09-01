"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SidebarNavItem } from "@/lib/auth/user-menu";

function isSidebarItemActive(item: SidebarNavItem, pathname: string): boolean {
  if (item.href === "/") {
    return pathname === "/";
  }

  const prefixes = [item.href, ...(item.activePrefixes ?? [])];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function Sidebar({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 print:hidden">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Outbound
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
          Email Platform
        </h1>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3" data-testid="app-sidebar">
        {items.map((item) => {
          const active = isSidebarItemActive(item, pathname);

          return (
            <div key={item.href}>
              {item.separatorBefore ? (
                <div
                  className="my-2 border-t border-slate-200"
                  aria-hidden="true"
                />
              ) : null}
              <Link
                href={item.href}
                data-testid={`sidebar-${item.href}`}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-200/70",
                )}
              >
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
        Phase 1 · Multi-tenant foundation
      </div>
    </aside>
  );
}
