"use client";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type {
  QualificationBucket,
  QualificationOverrideTarget,
} from "@prisma/client";
import { loadQualificationScoreDetailAction } from "@/app/actions/campaign-contacts";
import { setCampaignContactPersonaAction } from "@/app/actions/email";
import {
  bulkRestoreQualificationAction,
  overrideQualificationBucketAction,
} from "@/app/actions/qualification";
import { ExclusionDetailList } from "@/components/ExclusionDetailList";
import {
  InlineScoreDetails,
  type ScoreReportClientRow,
} from "@/components/ScoreDetailPanel";
import type { ExclusionDetail } from "@/lib/scoring/exclusion-detail";
import {
  EXCLUSION_REVIEW_COPY,
  QUALIFICATION_BUCKET_LABELS,
  QUALIFICATION_BUCKETS,
} from "@/lib/workflow/qualification";

export type QualificationBucketRow = {
  id: string;
  companyId?: string | null;
  /** Run that owns this row's score (needed when campaign merges multiple runs). */
  scoringRunId?: string | null;
  targetType: QualificationOverrideTarget;
  name: string;
  title?: string | null;
  company?: string | null;
  bucket: QualificationBucket;
  unresolvedCriterion: string | null;
  researchGuidance: string | null;
  researchHref: string | null;
  canOverride: boolean;
  secondaryFlags?: string[];
  exclusionDetails?: ExclusionDetail[];
  /** Stored qualification reason from the contact score. */
  scoreReason?: string | null;
};

export type ContactPersonaSelection = {
  options: Array<{ id: string; name: string }>;
  byContactId: Record<
    string,
    { campaignContactId: string; personaId: string | null }
  >;
};

const CARD_STYLES: Record<QualificationBucket, string> = {
  GOOD: "border-emerald-200 bg-emerald-50 text-emerald-900",
  NEEDS_REVIEW: "border-amber-200 bg-amber-50 text-amber-900",
  POOR_FIT: "border-rose-200 bg-rose-50 text-rose-900",
  EXCLUDED: "border-slate-300 bg-slate-100 text-slate-800",
};

export function QualificationBuckets({
  campaignId,
  scoringRunId,
  rows: initialRows,
  emptyTitle,
  emptyActionHref,
  emptyActionLabel,
  readOnly = false,
  showSummary = true,
  inlineScoreDetail = false,
  showScoreReason = false,
  personaSelection = null,
}: {
  campaignId: string;
  scoringRunId: string | null;
  rows: QualificationBucketRow[];
  emptyTitle: string;
  emptyActionHref: string;
  emptyActionLabel: string;
  readOnly?: boolean;
  showSummary?: boolean;
  /** Stage 5: expand score detail in place. Other stages keep the outbound link. */
  inlineScoreDetail?: boolean;
  /** Stage 5 contacts: show the stored score reason instead of the generic line. */
  showScoreReason?: boolean;
  /** Stage 7: persona used for email generation. Does not rescore. */
  personaSelection?: ContactPersonaSelection | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [message, setMessage] = useState<string | null>(null);
  const [openDetailKey, setOpenDetailKey] = useState<string | null>(null);
  const [detailByKey, setDetailByKey] = useState<
    Record<string, ScoreReportClientRow[]>
  >({});
  const [detailErrorByKey, setDetailErrorByKey] = useState<
    Record<string, string>
  >({});
  const [detailPendingKey, setDetailPendingKey] = useState<string | null>(null);
  const [personaByContactId, setPersonaByContactId] = useState<
    Record<string, string | null>
  >(() => {
    const initial: Record<string, string | null> = {};
    for (const [contactId, choice] of Object.entries(
      personaSelection?.byContactId ?? {},
    )) {
      initial[contactId] = choice.personaId;
    }
    return initial;
  });
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [keptExcludedIds, setKeptExcludedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pending, startTransition] = useTransition();

  function runIdForRow(row: QualificationBucketRow): string | null {
    return row.scoringRunId ?? scoringRunId;
  }

  function canActOnRow(row: QualificationBucketRow): boolean {
    return !readOnly && Boolean(runIdForRow(row));
  }

  function detailKey(row: QualificationBucketRow): string {
    return `${row.targetType}:${row.id}`;
  }

  async function toggleScoreDetail(row: QualificationBucketRow) {
    const key = detailKey(row);
    if (openDetailKey === key) {
      setOpenDetailKey(null);
      return;
    }
    setOpenDetailKey(key);
    if (detailByKey[key]) return;
    const runId = runIdForRow(row);
    if (!runId) {
      setDetailErrorByKey((current) => ({
        ...current,
        [key]: "No score detail is available for this row.",
      }));
      return;
    }
    setDetailPendingKey(key);
    setDetailErrorByKey((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    const result = await loadQualificationScoreDetailAction({
      scoringRunId: runId,
      targetType: row.targetType,
      targetId: row.id,
    });
    setDetailPendingKey((current) => (current === key ? null : current));
    if (!result.ok) {
      setDetailErrorByKey((current) => ({ ...current, [key]: result.message }));
      return;
    }
    setDetailByKey((current) => ({ ...current, [key]: result.rows }));
  }

  async function choosePersona(row: QualificationBucketRow, personaId: string) {
    const choice = personaSelection?.byContactId[row.id];
    if (!choice) {
      setPersonaError("This contact is not on the campaign.");
      return;
    }
    setPersonaByContactId((current) => ({ ...current, [row.id]: personaId }));
    setPersonaError(null);
    const result = await setCampaignContactPersonaAction({
      campaignContactId: choice.campaignContactId,
      personaId,
    });
    if (!result.ok) {
      setPersonaByContactId((current) => ({
        ...current,
        [row.id]: choice.personaId,
      }));
      setPersonaError(result.message);
      return;
    }
    router.refresh();
  }

  function canActOnRows(targetRows: QualificationBucketRow[]): boolean {
    return targetRows.some((row) => canActOnRow(row));
  }

  function restore(row: QualificationBucketRow, bucket: QualificationBucket) {
    const runId = runIdForRow(row);
    if (!runId) return;
    startTransition(async () => {
      const result = await overrideQualificationBucketAction({
        campaignId,
        scoringRunId: runId,
        targetType: row.targetType,
        targetId: row.id,
        bucket,
      });
      setMessage(result.message);
      if (result.ok && result.bucket) {
        setRows((current) =>
          current.map((entry) =>
            entry.id === row.id && entry.targetType === row.targetType
              ? { ...entry, bucket: result.bucket! }
              : entry,
          ),
        );
      }
    });
  }

  function restoreMany(
    targetRows: QualificationBucketRow[],
    bucket: QualificationBucket,
  ) {
    if (targetRows.length === 0) return;
    const byRun = new Map<string, QualificationBucketRow[]>();
    for (const row of targetRows) {
      const runId = runIdForRow(row);
      if (!runId) continue;
      const group = byRun.get(runId) ?? [];
      group.push(row);
      byRun.set(runId, group);
    }
    if (byRun.size === 0) return;
    startTransition(async () => {
      let restoredBucket: QualificationBucket | undefined;
      const messages: string[] = [];
      let anyOk = false;
      for (const [runId, group] of byRun) {
        const result = await bulkRestoreQualificationAction({
          campaignId,
          scoringRunId: runId,
          targetType: group[0]!.targetType,
          targetIds: group.map((row) => row.id),
          bucket,
        });
        messages.push(result.message);
        if (result.ok && result.bucket) {
          anyOk = true;
          restoredBucket = result.bucket;
        }
      }
      setMessage(messages[messages.length - 1] ?? null);
      if (anyOk && restoredBucket) {
        const ids = new Set(
          targetRows.map((row) => `${row.targetType}:${row.id}`),
        );
        setRows((current) =>
          current.map((entry) =>
            ids.has(`${entry.targetType}:${entry.id}`)
              ? { ...entry, bucket: restoredBucket! }
              : entry,
          ),
        );
      }
    });
  }

  function keepExcluded(rowKey: string) {
    setKeptExcludedIds((current) => new Set(current).add(rowKey));
  }

  function keepExcludedMany(rowKeys: string[]) {
    setKeptExcludedIds((current) => {
      const next = new Set(current);
      for (const key of rowKeys) next.add(key);
      return next;
    });
  }

  const excludedGroups = useMemo(() => {
    const groups = rows
      .filter(
        (row) =>
          row.bucket === "EXCLUDED" &&
          row.exclusionDetails?.length &&
          !keptExcludedIds.has(`${row.targetType}:${row.id}`),
      )
      .reduce((map, row) => {
        const detail = row.exclusionDetails![0]!;
        const key =
          detail.kind === "ICP"
            ? `ICP:${detail.criterionId ?? detail.criterionName}`
            : `PERSONA:${detail.criterionId ?? detail.criterionName}`;
        const entry = map.get(key) ?? {
          criterionName: detail.criterionName,
          rows: [] as QualificationBucketRow[],
        };
        entry.rows.push(row);
        map.set(key, entry);
        return map;
      }, new Map<string, { criterionName: string; rows: QualificationBucketRow[] }>());
    return [...groups.values()].filter((group) => group.rows.length > 1);
  }, [rows, keptExcludedIds]);

  const exclusionContactCount = useMemo(() => {
    const ids = new Set<string>();
    for (const group of excludedGroups) {
      for (const row of group.rows) ids.add(`${row.targetType}:${row.id}`);
    }
    return ids.size;
  }, [excludedGroups]);

  return (
    <div className="space-y-5">
      {showSummary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUALIFICATION_BUCKETS.map((bucket) => (
            <div
              key={bucket}
              className={`rounded-lg border p-4 ${CARD_STYLES[bucket]}`}
            >
              <p className="text-sm font-medium">
                {QUALIFICATION_BUCKET_LABELS[bucket]}
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {rows.filter((row) => row.bucket === bucket).length}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {message ? (
        <p role="status" className="text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      {excludedGroups.length > 0 ? (
        <div className="space-y-4" data-testid="bulk-exclusion-restore">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {EXCLUSION_REVIEW_COPY.panelHeading(exclusionContactCount)}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {EXCLUSION_REVIEW_COPY.panelSubheading}
            </p>
          </div>
          {excludedGroups.map((group) => (
            <div
              key={group.criterionName}
              className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="font-medium text-slate-900">
                  {EXCLUSION_REVIEW_COPY.groupReason(group.criterionName)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending || !canActOnRows(group.rows)}
                    onClick={() =>
                      keepExcludedMany(
                        group.rows.map((row) => `${row.targetType}:${row.id}`),
                      )
                    }
                    className={cn(SECONDARY_BUTTON_CLASS, "py-1", "!px-2", "!py-1", "!text-xs")}
                  >
                    {EXCLUSION_REVIEW_COPY.keepExcluded}
                  </button>
                  <button
                    type="button"
                    disabled={pending || !canActOnRows(group.rows)}
                    onClick={() => restoreMany(group.rows, "GOOD")}
                    className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                  >
                    {EXCLUSION_REVIEW_COPY.addAllBack}
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                {group.rows.map((row) => (
                  <li
                    key={`${row.targetType}:${row.id}`}
                    className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-600">
                        {[row.title, row.company].filter(Boolean).join(" · ") ||
                          "—"}
                      </p>
                    </div>
                    {row.canOverride ? (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={pending || !canActOnRow(row)}
                          onClick={() =>
                            keepExcluded(`${row.targetType}:${row.id}`)
                          }
                          className={cn(SECONDARY_BUTTON_CLASS, "py-1", "!px-2", "!py-1", "!text-xs")}
                        >
                          {EXCLUSION_REVIEW_COPY.keepExcluded}
                        </button>
                        <button
                          type="button"
                          disabled={pending || !canActOnRow(row)}
                          onClick={() => restore(row, "GOOD")}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                        >
                          {EXCLUSION_REVIEW_COPY.addBack}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-7 text-center">
          <h3 className="font-semibold text-slate-900">{emptyTitle}</h3>
          <p className="mt-1 text-sm text-slate-600">
            Complete the preceding stage to populate this view.
          </p>
          <Link
            href={emptyActionHref}
            className={cn(PRIMARY_BUTTON_CLASS, "mt-4", "!px-3")}
          >
            {emptyActionLabel}
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {personaError ? (
            <p className="text-sm text-red-700" role="alert">
              {personaError}
            </p>
          ) : null}
          {rows.map((row) => (
            <article
              key={`${row.targetType}:${row.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-slate-900">{row.name}</h3>
                  {row.title ? (
                    <p className="mt-0.5 text-sm text-slate-600">{row.title}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-600">
                    {QUALIFICATION_BUCKET_LABELS[row.bucket]}
                  </p>
                  {showScoreReason && row.scoreReason ? (
                    <p
                      className="mt-1 text-sm text-slate-800"
                      data-testid={`score-reason-${row.targetType}-${row.id}`}
                    >
                      {row.scoreReason}
                    </p>
                  ) : null}
                  {personaSelection && row.targetType === "CONTACT" ? (
                    <label className="mt-2 block text-xs font-medium text-slate-700">
                      Persona for email
                      <select
                        className="mt-1 block w-full max-w-xs rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                        data-testid={`contact-persona-${row.id}`}
                        disabled={pending || readOnly}
                        value={personaByContactId[row.id] ?? ""}
                        onChange={(event) => {
                          const personaId = event.target.value;
                          if (!personaId) return;
                          void choosePersona(row, personaId);
                        }}
                      >
                        <option value="">Choose a persona</option>
                        {personaSelection.options.map((persona) => (
                          <option key={persona.id} value={persona.id}>
                            {persona.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {row.secondaryFlags && row.secondaryFlags.length > 0 ? (
                    <p className="mt-1 text-xs font-medium text-emerald-800">
                      {row.secondaryFlags.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.bucket === "EXCLUDED" && row.canOverride ? (
                    <button
                      type="button"
                      disabled={pending || !canActOnRow(row)}
                      onClick={() => restore(row, "GOOD")}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                      data-testid={`restore-${row.targetType}-${row.id}`}
                    >
                      {EXCLUSION_REVIEW_COPY.addBack}
                    </button>
                  ) : null}
                  {row.targetType === "COMPANY" && row.canOverride ? (
                    <Link
                      href={`/companies/${row.id}`}
                      data-testid={`open-company-research-${row.id}`}
                      className={cn(SECONDARY_BUTTON_CLASS, "py-1", "!px-2", "!py-1", "!text-xs")}
                    >
                      Open company research
                    </Link>
                  ) : null}
                  {row.bucket !== "EXCLUDED" && row.canOverride
                    ? QUALIFICATION_BUCKETS.filter(
                        (bucket) => bucket !== row.bucket,
                      ).map((bucket) => (
                        <button
                          key={bucket}
                          type="button"
                          disabled={pending || !canActOnRow(row)}
                          onClick={() => restore(row, bucket)}
                          className={cn(SECONDARY_BUTTON_CLASS, "py-1", "!px-2", "!py-1", "!text-xs")}
                        >
                          Move to {QUALIFICATION_BUCKET_LABELS[bucket]}
                        </button>
                      ))
                    : null}
                </div>
              </div>
              {row.bucket === "EXCLUDED" && row.exclusionDetails?.length ? (
                <div className="mt-3">
                  <ExclusionDetailList details={row.exclusionDetails} />
                </div>
              ) : null}
              {row.bucket === "NEEDS_REVIEW" &&
              row.unresolvedCriterion &&
              !(
                showScoreReason &&
                row.scoreReason &&
                row.unresolvedCriterion.startsWith("Qualification is incomplete")
              ) ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p>{row.unresolvedCriterion}</p>
                  {row.researchGuidance ? (
                    <p className="mt-1 text-xs">{row.researchGuidance}</p>
                  ) : null}
                  {!inlineScoreDetail && row.researchHref ? (
                    <Link
                      href={row.researchHref}
                      className="mt-2 inline-block text-xs font-medium underline"
                    >
                      Open score detail
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {inlineScoreDetail ? (
                <div className="mt-3">
                  <button
                    type="button"
                    aria-expanded={openDetailKey === detailKey(row)}
                    data-testid={`show-score-detail-${row.targetType}-${row.id}`}
                    className="text-xs font-semibold uppercase tracking-wide text-slate-900 underline"
                    onClick={() => void toggleScoreDetail(row)}
                  >
                    {openDetailKey === detailKey(row)
                      ? "HIDE SCORE DETAIL"
                      : "SHOW SCORE DETAIL"}
                  </button>
                  {openDetailKey === detailKey(row) &&
                  detailPendingKey === detailKey(row) &&
                  !detailByKey[detailKey(row)] ? (
                    <p className="mt-2 text-sm text-slate-600">
                      Loading score detail…
                    </p>
                  ) : null}
                  {openDetailKey === detailKey(row) &&
                  detailErrorByKey[detailKey(row)] &&
                  !detailByKey[detailKey(row)] ? (
                    <p className="mt-2 text-sm text-red-700" role="alert">
                      {detailErrorByKey[detailKey(row)]}
                    </p>
                  ) : null}
                  {openDetailKey === detailKey(row) &&
                  detailByKey[detailKey(row)] ? (
                    <InlineScoreDetails
                      rows={detailByKey[detailKey(row)]}
                      targetType={row.targetType}
                    />
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
