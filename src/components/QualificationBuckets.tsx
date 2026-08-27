"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type {
  QualificationBucket,
  QualificationOverrideTarget,
} from "@prisma/client";
import {
  bulkRestoreQualificationAction,
  overrideQualificationBucketAction,
} from "@/app/actions/qualification";
import { ExclusionDetailList } from "@/components/ExclusionDetailList";
import type { ExclusionDetail } from "@/lib/scoring/exclusion-detail";
import {
  QUALIFICATION_BUCKET_LABELS,
  QUALIFICATION_BUCKETS,
} from "@/lib/workflow/qualification";

export type QualificationBucketRow = {
  id: string;
  companyId?: string | null;
  targetType: QualificationOverrideTarget;
  name: string;
  bucket: QualificationBucket;
  unresolvedCriterion: string | null;
  researchGuidance: string | null;
  researchHref: string | null;
  canOverride: boolean;
  secondaryFlags?: string[];
  exclusionDetails?: ExclusionDetail[];
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
}: {
  campaignId: string;
  scoringRunId: string | null;
  rows: QualificationBucketRow[];
  emptyTitle: string;
  emptyActionHref: string;
  emptyActionLabel: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore(row: QualificationBucketRow, bucket: QualificationBucket) {
    if (!scoringRunId) return;
    startTransition(async () => {
      const result = await overrideQualificationBucketAction({
        campaignId,
        scoringRunId,
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
    if (!scoringRunId || targetRows.length === 0) return;
    startTransition(async () => {
      const result = await bulkRestoreQualificationAction({
        campaignId,
        scoringRunId,
        targetType: targetRows[0]!.targetType,
        targetIds: targetRows.map((row) => row.id),
        bucket,
      });
      setMessage(result.message);
      if (result.ok && result.bucket) {
        const ids = new Set(targetRows.map((row) => `${row.targetType}:${row.id}`));
        setRows((current) =>
          current.map((entry) =>
            ids.has(`${entry.targetType}:${entry.id}`)
              ? { ...entry, bucket: result.bucket! }
              : entry,
          ),
        );
      }
    });
  }

  const excludedGroups = rows
    .filter((row) => row.bucket === "EXCLUDED" && row.exclusionDetails?.length)
    .reduce((groups, row) => {
      const detail = row.exclusionDetails![0]!;
      const key =
        detail.kind === "ICP"
          ? `ICP:${detail.criterionId ?? detail.criterionName}`
          : `PERSONA:${detail.criterionId ?? detail.criterionName}`;
      const entry = groups.get(key) ?? {
        criterionName: detail.criterionName,
        rows: [] as QualificationBucketRow[],
      };
      entry.rows.push(row);
      groups.set(key, entry);
      return groups;
    }, new Map<string, { criterionName: string; rows: QualificationBucketRow[] }>());
  const bulkExcludedGroups = [...excludedGroups.values()].filter(
    (group) => group.rows.length > 1,
  );

  return (
    <div className="space-y-5">
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

      {message ? (
        <p role="status" className="text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      {bulkExcludedGroups.length > 0 ? (
        <div className="space-y-2" data-testid="bulk-exclusion-restore">
          {bulkExcludedGroups.map((group) => (
            <div
              key={group.criterionName}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800"
            >
              <p>
                {group.rows.length} rows excluded on{" "}
                <strong>{group.criterionName}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || !scoringRunId}
                  onClick={() => restoreMany(group.rows, "GOOD")}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                >
                  Restore all to Good
                </button>
                <button
                  type="button"
                  disabled={pending || !scoringRunId}
                  onClick={() => restoreMany(group.rows, "NEEDS_REVIEW")}
                  className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
                >
                  Restore all to Needs review
                </button>
              </div>
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
            className="mt-4 inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            {emptyActionLabel}
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article
              key={`${row.targetType}:${row.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-slate-900">{row.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {QUALIFICATION_BUCKET_LABELS[row.bucket]}
                  </p>
                  {row.secondaryFlags && row.secondaryFlags.length > 0 ? (
                    <p className="mt-1 text-xs font-medium text-emerald-800">
                      {row.secondaryFlags.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.bucket === "EXCLUDED" && row.canOverride ? (
                    <>
                      <button
                        type="button"
                        disabled={pending || !scoringRunId}
                        onClick={() => restore(row, "GOOD")}
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                        data-testid={`restore-${row.targetType}-${row.id}`}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        disabled={pending || !scoringRunId}
                        onClick={() => restore(row, "NEEDS_REVIEW")}
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
                      >
                        Needs review
                      </button>
                    </>
                  ) : null}
                  {QUALIFICATION_BUCKETS.map((bucket) => (
                    <button
                      key={bucket}
                      type="button"
                      disabled={pending || !scoringRunId || !row.canOverride}
                      onClick={() => restore(row, bucket)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${
                        row.bucket === bucket
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 text-slate-600"
                      }`}
                    >
                      {QUALIFICATION_BUCKET_LABELS[bucket]}
                    </button>
                  ))}
                </div>
              </div>
              {row.bucket === "EXCLUDED" && row.exclusionDetails?.length ? (
                <div className="mt-3">
                  <ExclusionDetailList details={row.exclusionDetails} />
                </div>
              ) : null}
              {row.bucket === "NEEDS_REVIEW" && row.unresolvedCriterion ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-950">
                    {row.unresolvedCriterion}
                  </p>
                  {row.researchGuidance ? (
                    <p className="mt-1 text-xs text-amber-800">
                      {row.researchGuidance}
                    </p>
                  ) : null}
                  {row.researchHref ? (
                    <Link
                      href={row.researchHref}
                      className="mt-2 inline-flex text-sm font-medium text-amber-950 underline"
                    >
                      Research this {row.targetType.toLowerCase()}
                    </Link>
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
