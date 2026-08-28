/**
 * Node-safe research run worker logic (no server-only).
 * Next.js entry: `@/lib/research/runs` re-exports behind server-only.
 */

import type { Prisma, ResearchRun, ResearchRunStatus } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";
import {
  getCompaniesNeedingResearchForContactList,
  researchCompany,
  type ResearchPlanItem,
} from "@/lib/tenant/company-research-service";
import { runWithTenantContext } from "@/lib/tenant/request-context";
import { TenantError } from "@/lib/tenant/errors";
import { getResearchWorkerConcurrency } from "@/lib/research/config";
import type { ResearchRunView } from "@/lib/research/run-types";

export type { ResearchRunView } from "@/lib/research/run-types";
export { isResearchRunPaused } from "@/lib/research/run-types";

export const HEARTBEAT_STALE_MS = 15 * 60 * 1000;
export const RUN_ABANDON_MS = 24 * 60 * 60 * 1000;

export const researchWorkerShutdown = {
  requested: false,
};

const TERMINAL_STATUSES: ResearchRunStatus[] = [
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
];

function parseStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toResearchRunView(run: ResearchRun): ResearchRunView {
  return {
    id: run.id,
    contactListId: run.contactListId,
    scoringRunId: run.scoringRunId,
    status: run.status,
    forceRefresh: run.forceRefresh,
    failuresOnly: run.failuresOnly,
    retryOfRunId: run.retryOfRunId,
    totalCompanies: run.totalCompanies,
    completedCount: run.completedCount,
    failedCount: run.failedCount,
    skippedFreshCount: run.skippedFreshCount,
    quotaBlockedCount: run.quotaBlockedCount,
    currentCompanyName: run.currentCompanyName,
    lastError: run.lastError,
    failedCompanyIds: parseStringArray(run.failedCompanyIds),
    quotaBlockedCompanyNames: parseStringArray(run.quotaBlockedCompanyNames),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    pausedAt: run.pausedAt?.toISOString() ?? null,
  };
}

function isTerminalStatus(status: ResearchRunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function lastActivityAt(run: Pick<
  ResearchRun,
  "workerHeartbeatAt" | "startedAt" | "createdAt"
>): Date {
  return run.workerHeartbeatAt ?? run.startedAt ?? run.createdAt;
}

function isAbandoned(run: ResearchRun, now = new Date()): boolean {
  if (run.status !== "IN_PROGRESS") return false;
  const last = lastActivityAt(run);
  return now.getTime() - last.getTime() > RUN_ABANDON_MS;
}

function finalizeStatus(input: {
  total: number;
  completed: number;
  failed: number;
  skippedFresh: number;
  quotaBlocked: number;
}): ResearchRunStatus {
  const { total, completed, failed, skippedFresh, quotaBlocked } = input;
  if (total === 0) return "COMPLETED";
  if (failed === total) return "FAILED";
  if (completed > 0 || skippedFresh > 0) {
    if (failed > 0 || quotaBlocked > 0) return "PARTIAL";
    return "COMPLETED";
  }
  if (quotaBlocked > 0) return "PARTIAL";
  if (failed > 0) return "FAILED";
  return "COMPLETED";
}

async function findActiveRunForList(
  contactListId: string,
  organizationId: string,
): Promise<ResearchRun | null> {
  return prisma.researchRun.findFirst({
    where: {
      organizationId,
      contactListId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

function buildTargetItems(
  plan: Awaited<ReturnType<typeof getCompaniesNeedingResearchForContactList>>,
  options: {
    forceRefresh: boolean;
    failuresOnly: boolean;
    failureTargetIds: string[];
  },
): ResearchPlanItem[] {
  let items = options.forceRefresh
    ? plan.items
    : plan.items.filter((item) => item.reason !== "fresh");

  if (options.failuresOnly) {
    const allowed = new Set(options.failureTargetIds);
    items = items.filter((item) => allowed.has(item.companyId));
  }

  return items;
}

export async function getResearchRunForOrganization(
  runId: string,
  organizationId: string,
): Promise<ResearchRunView | null> {
  const run = await prisma.researchRun.findFirst({
    where: { id: runId, organizationId },
  });
  return run ? toResearchRunView(run) : null;
}

export async function getActiveResearchRunForContactList(
  contactListId: string,
  organizationId: string,
): Promise<ResearchRunView | null> {
  const run = await findActiveRunForList(contactListId, organizationId);
  return run ? toResearchRunView(run) : null;
}

export async function getLatestResearchRunForContactList(
  contactListId: string,
  organizationId: string,
): Promise<ResearchRunView | null> {
  const run = await prisma.researchRun.findFirst({
    where: { organizationId, contactListId },
    orderBy: { createdAt: "desc" },
  });
  return run ? toResearchRunView(run) : null;
}

export type CreateResearchRunInput = {
  organizationId: string;
  contactListId: string;
  initiatedByUserId: string;
  forceRefresh?: boolean;
  scoringRunId?: string;
  failuresOnly?: boolean;
  retryOfRunId?: string;
};

export type CreateResearchRunResult =
  | { ok: true; run: ResearchRunView }
  | { ok: false; code: "ACTIVE_RUN"; activeRunId: string; message: string }
  | { ok: false; code: "NOTHING_TO_DO"; message: string }
  | { ok: false; code: "INVALID_RETRY"; message: string };

export async function createResearchRun(
  input: CreateResearchRunInput,
): Promise<CreateResearchRunResult> {
  const existing = await findActiveRunForList(
    input.contactListId,
    input.organizationId,
  );
  if (existing) {
    return {
      ok: false,
      code: "ACTIVE_RUN",
      activeRunId: existing.id,
      message: "A research run is already in progress for this list.",
    };
  }

  let failureTargetIds: string[] = [];
  if (input.failuresOnly) {
    if (!input.retryOfRunId) {
      return {
        ok: false,
        code: "INVALID_RETRY",
        message: "Retry requires a prior run id.",
      };
    }
    const parent = await prisma.researchRun.findFirst({
      where: {
        id: input.retryOfRunId,
        organizationId: input.organizationId,
        contactListId: input.contactListId,
      },
    });
    if (!parent || !isTerminalStatus(parent.status)) {
      return {
        ok: false,
        code: "INVALID_RETRY",
        message: "Retry is only available after the prior run has finished.",
      };
    }
    failureTargetIds = [
      ...new Set([
        ...parseStringArray(parent.failedCompanyIds),
        ...parseStringArray(parent.quotaBlockedCompanyIds),
      ]),
    ];
    if (failureTargetIds.length === 0) {
      return {
        ok: false,
        code: "NOTHING_TO_DO",
        message: "No failed or quota-blocked companies to retry.",
      };
    }
  }

  const plan = await runWithTenantContext(
    {
      organizationId: input.organizationId,
      userId: input.initiatedByUserId,
    },
    () => getCompaniesNeedingResearchForContactList(input.contactListId),
  );

  const targets = buildTargetItems(plan, {
    forceRefresh: Boolean(input.forceRefresh),
    failuresOnly: Boolean(input.failuresOnly),
    failureTargetIds,
  });

  if (!input.forceRefresh && !input.failuresOnly && plan.needingResearch === 0) {
    return {
      ok: false,
      code: "NOTHING_TO_DO",
      message: `All ${plan.uniqueCompanies} unique companies already have fresh research.`,
    };
  }

  if (targets.length === 0) {
    return {
      ok: false,
      code: "NOTHING_TO_DO",
      message: "No companies match this research request.",
    };
  }

  try {
    const run = await prisma.researchRun.create({
      data: {
        organizationId: input.organizationId,
        contactListId: input.contactListId,
        scoringRunId: input.scoringRunId ?? null,
        initiatedByUserId: input.initiatedByUserId,
        forceRefresh: Boolean(input.forceRefresh),
        failuresOnly: Boolean(input.failuresOnly),
        retryOfRunId: input.retryOfRunId ?? null,
        totalCompanies: targets.length,
        status: "PENDING",
        ...(input.failuresOnly
          ? {
              failedCompanyIds: failureTargetIds,
              quotaBlockedCompanyIds: [],
            }
          : {}),
      },
    });
    return { ok: true, run: toResearchRunView(run) };
  } catch (error) {
    if (
      error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const active = await findActiveRunForList(
        input.contactListId,
        input.organizationId,
      );
      return {
        ok: false,
        code: "ACTIVE_RUN",
        activeRunId: active?.id ?? "",
        message: "A research run is already in progress for this list.",
      };
    }
    throw error;
  }
}

export async function abandonStaleResearchRuns(now = new Date()): Promise<number> {
  const inProgress = await prisma.researchRun.findMany({
    where: { status: "IN_PROGRESS" },
    select: {
      id: true,
      workerHeartbeatAt: true,
      startedAt: true,
      createdAt: true,
    },
  });

  let abandoned = 0;
  for (const run of inProgress) {
    if (!isAbandoned(run as ResearchRun, now)) continue;
    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        lastError: "Run abandoned after 24 hours without progress.",
        completedAt: now,
        currentCompanyId: null,
        currentCompanyName: null,
      },
    });
    abandoned += 1;
  }
  return abandoned;
}

export async function claimNextResearchRun(now = new Date()): Promise<string | null> {
  const staleCutoff = new Date(now.getTime() - HEARTBEAT_STALE_MS);

  const staleInProgress = {
    status: "IN_PROGRESS" as const,
    pausedAt: null,
    OR: [
      { workerHeartbeatAt: { lt: staleCutoff } },
      { workerHeartbeatAt: null, startedAt: { lt: staleCutoff } },
      { workerHeartbeatAt: null, startedAt: null, createdAt: { lt: staleCutoff } },
    ],
  };

  const candidate = await prisma.researchRun.findFirst({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "IN_PROGRESS", pausedAt: { not: null } },
        staleInProgress,
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!candidate) return null;

  const claimed = await prisma.researchRun.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: "PENDING" },
        { status: "IN_PROGRESS", pausedAt: { not: null } },
        staleInProgress,
      ],
    },
    data: {
      status: "IN_PROGRESS",
      startedAt: candidate.startedAt ?? now,
      workerHeartbeatAt: now,
      pausedAt: null,
      lastError: null,
    },
  });

  if (claimed.count === 0) return null;
  return candidate.id;
}

async function mapPoolWithShutdown<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (!researchWorkerShutdown.requested) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current]!, current);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

export async function processResearchRun(runId: string): Promise<void> {
  const run = await prisma.researchRun.findUnique({ where: { id: runId } });
  if (!run) return;
  if (run.status !== "IN_PROGRESS") return;

  const failureTargetIds = run.failuresOnly
    ? [...new Set(parseStringArray(run.failedCompanyIds))]
    : [];

  await runWithTenantContext(
    {
      organizationId: run.organizationId,
      userId: run.initiatedByUserId,
    },
    async () => {
      const plan = await getCompaniesNeedingResearchForContactList(run.contactListId);
      const targets = buildTargetItems(plan, {
        forceRefresh: run.forceRefresh,
        failuresOnly: run.failuresOnly,
        failureTargetIds,
      });

      if (targets.length !== run.totalCompanies) {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: { totalCompanies: targets.length },
        });
      }

      const { companyHasActiveResearchSlot } = await import(
        "@/lib/usage/active-companies-service"
      );
      const { getActiveResearchedCompanyUsage } = await import(
        "@/lib/usage/quota-service"
      );

      const refreshTargets: ResearchPlanItem[] = [];
      const newSlotTargets: ResearchPlanItem[] = [];
      for (const item of targets) {
        const hasSlot = await companyHasActiveResearchSlot(
          run.organizationId,
          item.companyId,
        );
        if (hasSlot) refreshTargets.push(item);
        else newSlotTargets.push(item);
      }

      let remainingSlots = Number.POSITIVE_INFINITY;
      if (run.initiatedByUserId) {
        const usage = await getActiveResearchedCompanyUsage({
          organizationId: run.organizationId,
          userId: run.initiatedByUserId,
        });
        remainingSlots = usage.remaining;
      }

      const allowedNew = newSlotTargets.slice(0, Math.max(0, remainingSlots));
      const blockedNew = newSlotTargets.slice(Math.max(0, remainingSlots));
      const workQueue = [...refreshTargets, ...allowedNew].filter(
        (item) => !processedCompanyIds.has(item.companyId),
      );

      let completedCount = run.completedCount;
      let failedCount = run.failedCount;
      let skippedFreshCount = run.skippedFreshCount;
      let quotaBlockedCount = run.quotaBlockedCount;
      const processedCompanyIds = new Set(
        parseStringArray(run.processedCompanyIds),
      );
      const failedCompanyIds = new Set(
        run.failuresOnly ? [] : parseStringArray(run.failedCompanyIds),
      );
      const quotaBlockedCompanyIds = new Set(
        parseStringArray(run.quotaBlockedCompanyIds),
      );
      const quotaBlockedCompanyNames = new Set(
        parseStringArray(run.quotaBlockedCompanyNames),
      );

      const pendingBlockedNew = blockedNew.filter(
        (item) => !processedCompanyIds.has(item.companyId),
      );

      for (const item of pendingBlockedNew) {
        if (!quotaBlockedCompanyIds.has(item.companyId)) {
          quotaBlockedCount += 1;
        }
        quotaBlockedCompanyIds.add(item.companyId);
        quotaBlockedCompanyNames.add(item.companyName);
        processedCompanyIds.add(item.companyId);
      }

      if (pendingBlockedNew.length > 0) {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: {
            quotaBlockedCount,
            quotaBlockedCompanyIds: [...quotaBlockedCompanyIds],
            quotaBlockedCompanyNames: [...quotaBlockedCompanyNames],
            processedCompanyIds: [...processedCompanyIds],
            workerHeartbeatAt: new Date(),
          },
        });
      }

      await mapPoolWithShutdown(
        workQueue,
        getResearchWorkerConcurrency(),
        async (item) => {
          if (researchWorkerShutdown.requested) return;

          await prisma.researchRun.update({
            where: { id: run.id },
            data: {
              currentCompanyId: item.companyId,
              currentCompanyName: item.companyName,
              workerHeartbeatAt: new Date(),
              pausedAt: null,
            },
          });

          const result = await researchCompany(item.companyId, {
            force: run.forceRefresh,
          });

          if (result.quotaBlocked) {
            quotaBlockedCount += 1;
            quotaBlockedCompanyIds.add(item.companyId);
            quotaBlockedCompanyNames.add(item.companyName);
          } else if (result.skipped) {
            skippedFreshCount += 1;
          } else if (result.refreshFailed) {
            failedCount += 1;
            failedCompanyIds.add(item.companyId);
          } else if (
            result.research?.status === "COMPLETED" ||
            result.research?.status === "PARTIAL"
          ) {
            completedCount += 1;
          } else if (result.research?.status === "FAILED") {
            failedCount += 1;
            failedCompanyIds.add(item.companyId);
          }

          processedCompanyIds.add(item.companyId);

          await prisma.researchRun.update({
            where: { id: run.id },
            data: {
              completedCount,
              failedCount,
              skippedFreshCount,
              quotaBlockedCount,
              failedCompanyIds: [...failedCompanyIds],
              processedCompanyIds: [...processedCompanyIds],
              quotaBlockedCompanyIds: [...quotaBlockedCompanyIds],
              quotaBlockedCompanyNames: [...quotaBlockedCompanyNames],
              workerHeartbeatAt: new Date(),
              lastError: result.refreshFailed
                ? (result.reason ?? "Research failed.")
                : null,
            },
          });
        },
      );

      if (researchWorkerShutdown.requested) {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: {
            currentCompanyId: null,
            currentCompanyName: null,
            pausedAt: new Date(),
            workerHeartbeatAt: new Date(),
          },
        });
        return;
      }

      const total = targets.length;
      const status = finalizeStatus({
        total,
        completed: completedCount,
        failed: failedCount,
        skippedFresh: skippedFreshCount,
        quotaBlocked: quotaBlockedCount,
      });

      await prisma.researchRun.update({
        where: { id: run.id },
        data: {
          status,
          completedAt: new Date(),
          currentCompanyId: null,
          currentCompanyName: null,
          workerHeartbeatAt: new Date(),
          totalCompanies: total,
        },
      });
    },
  );
}

export async function requireResearchRunInOrganization(
  runId: string,
  organizationId: string,
): Promise<ResearchRun> {
  const run = await prisma.researchRun.findFirst({
    where: { id: runId, organizationId },
  });
  if (!run) {
    throw new TenantError("Research run not found in the active organization.");
  }
  return run;
}

export function canRetryResearchRun(run: ResearchRun): boolean {
  if (!isTerminalStatus(run.status)) return false;
  const failed = parseStringArray(run.failedCompanyIds);
  const quotaBlocked = parseStringArray(run.quotaBlockedCompanyIds);
  return (
    failed.length + quotaBlocked.length > 0 || run.quotaBlockedCount > 0
  );
}
