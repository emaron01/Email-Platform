"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SidebarNavItem } from "@/lib/auth/user-menu";
import {
  campaignStageMarker,
  resolveCampaignStage,
  type CampaignStage,
  type CampaignStageKey,
} from "@/lib/workflow/campaign-stages";

export type CampaignSidebarProgress = {
  campaignId: string;
  stages: CampaignStage[];
  currentStage: CampaignStageKey;
};

function isSidebarItemActive(item: SidebarNavItem, pathname: string): boolean {
  if (item.href === "/") {
    return pathname === "/";
  }

  const prefixes = [item.href, ...(item.activePrefixes ?? [])];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function Sidebar({
  items,
  campaign = null,
}: {
  items: SidebarNavItem[];
  campaign?: CampaignSidebarProgress | null;
}) {
  const pathname = usePathname();
  const progressStage = resolveCampaignStage(
    undefined,
    campaign?.stages ?? [],
  );

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
        {campaign ? (
          <ol
            className="mb-2 flex flex-col gap-0.5 border-b border-slate-200 pb-2"
            data-testid="campaign-sidebar-stages"
          >
            {campaign.stages.map((stage) => {
              const marker = campaignStageMarker(stage, progressStage);
              const body = (
                <>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${marker.className}`}
                  >
                    {marker.text}
                  </span>
                  <span>{stage.label}</span>
                </>
              );
              return (
                <li key={stage.key}>
                  {stage.available ? (
                    <Link
                      href={`/campaigns/${campaign.campaignId}?stage=${stage.key}`}
                      data-testid={`campaign-sidebar-stage-${stage.key}`}
                      aria-current={
                        campaign.currentStage === stage.key ? "step" : undefined
                      }
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                        campaign.currentStage === stage.key
                          ? "bg-slate-100 text-slate-950"
                          : "text-slate-700 hover:bg-slate-200/70",
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <span
                      title={stage.unavailableReason ?? undefined}
                      aria-disabled="true"
                      data-testid={`campaign-sidebar-stage-${stage.key}`}
                      className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-400"
                    >
                      {body}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : null}
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
