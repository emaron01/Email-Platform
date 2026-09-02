import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CAMPAIGN_STAGE_KEYS } from "@/lib/workflow/campaign-stages";

const APP_ROOT = join(process.cwd(), "src", "app");

function collectPageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectPageFiles(full));
      continue;
    }
    if (entry === "page.tsx") out.push(full);
  }
  return out;
}

/** Convert `src/app/.../page.tsx` to a URL pattern (route groups omitted). */
export function pageFileToRoutePattern(pageFile: string): string {
  const rel = relative(APP_ROOT, pageFile).replace(/\\/g, "/");
  const withoutPage = rel.replace(/\/page\.tsx$/, "");
  const segments = withoutPage
    .split("/")
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")));
  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

export function discoverAppRoutePatterns(): string[] {
  const patterns = collectPageFiles(APP_ROOT)
    .map(pageFileToRoutePattern)
    .sort();
  return [...new Set(patterns)];
}

export type SmokeRouteIds = {
  organizationId: string;
  productId: string;
  icpId: string;
  personaId: string;
  campaignId: string;
  listId: string;
  companyId: string;
  scoringRunId: string;
  productSetupRunId: string;
  productResynthesisRunId: string;
  personaSetupRunId: string;
  personaResynthesisRunId: string;
};

function substituteRunId(pattern: string, ids: SmokeRouteIds): string {
  if (pattern.startsWith("/scoring/")) {
    return pattern.replace("[runId]", ids.scoringRunId);
  }
  if (pattern.includes("/research/resynthesis/")) {
    return pattern.replace("[runId]", ids.productResynthesisRunId);
  }
  if (pattern.includes("/rebuild/")) {
    return pattern.replace("[runId]", ids.personaResynthesisRunId);
  }
  if (pattern.includes("/personas/")) {
    return pattern.replace("[runId]", ids.personaSetupRunId);
  }
  return pattern.replace("[runId]", ids.productSetupRunId);
}

function substituteId(pattern: string, ids: SmokeRouteIds): string {
  if (pattern.startsWith("/campaigns/")) {
    return pattern.replace("[id]", ids.campaignId);
  }
  if (pattern.startsWith("/lists/")) {
    return pattern.replace("[id]", ids.listId);
  }
  if (pattern.startsWith("/platform/orgs/")) {
    return pattern.replace("[id]", ids.organizationId);
  }
  return pattern.replace("[id]", ids.organizationId);
}

/** Expand dynamic segments using seeded fixture ids. */
export function expandRoutePattern(
  pattern: string,
  ids: SmokeRouteIds,
): string[] {
  if (pattern.includes("[stage]")) {
    return CAMPAIGN_STAGE_KEYS.map((stage) =>
      expandRoutePattern(pattern.replace("[stage]", stage), ids),
    ).flat();
  }

  let current = pattern;
  if (current.includes("[runId]")) {
    current = substituteRunId(current, ids);
  }
  if (current.includes("[id]")) {
    current = substituteId(current, ids);
  }

  current = current
    .replaceAll("[productId]", ids.productId)
    .replaceAll("[personaId]", ids.personaId)
    .replaceAll("[icpId]", ids.icpId)
    .replaceAll("[companyId]", ids.companyId);

  if (current.includes("[")) {
    throw new Error(`Unresolved dynamic segment in smoke route: ${pattern}`);
  }

  return [current];
}

export function discoverExpandedSmokeRoutes(ids: SmokeRouteIds): string[] {
  const expanded = discoverAppRoutePatterns().flatMap((pattern) =>
    expandRoutePattern(pattern, ids),
  );
  return [...new Set(expanded)].sort();
}
