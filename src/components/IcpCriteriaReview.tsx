"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  decideIcpTargetedSearchAction,
  updateIcpEvidenceClassAction,
} from "@/app/actions/interpretation";
import {
  buildEvidenceClassSummary,
  criterionMaterialFingerprint,
  evidenceClassAvailabilityLabel,
  EXPECTATION_SETTING_LINE,
  isTargetedSearchDecisionStale,
  normalizeEvidenceClass,
  TARGETED_SEARCH_SECTION_BODY,
  TARGETED_SEARCH_SECTION_TITLE,
  type CriterionEvidenceClassValue,
  type TargetedSearchDecisionValue,
} from "@/lib/criteria/evidence-class";
import { formatCriterionDisplay } from "@/lib/criteria/types";

export type IcpCriterionReviewRow = {
  id?: string;
  name: string;
  description?: string | null;
  importance: string;
  isDisqualifier: boolean;
  isRequired: boolean;
  manuallyEdited?: boolean;
  dataType: string;
  operator: string;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  allowedValues?: unknown;
  sortOrder: number;
  criterionType: string;
  evidenceClass?: CriterionEvidenceClassValue | string | null;
  evidenceClassLocked?: boolean;
  targetedSearchDecision?: TargetedSearchDecisionValue | null;
  targetedSearchDecisionFingerprint?: string | null;
};

function roleGlyph(c: IcpCriterionReviewRow): string {
  if (c.isDisqualifier) return "✗";
  if (c.isRequired) return "✓";
  return "☆";
}

function DecisionForm({
  productId,
  icpId,
  criterion,
}: {
  productId: string;
  icpId: string;
  criterion: IcpCriterionReviewRow;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    decideIcpTargetedSearchAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (!criterion.id) return null;

  return (
    <div className="mt-2 space-y-2" data-testid="targeted-search-decision">
      <p className="text-xs font-medium text-red-900">
        Decide how to treat this criterion:
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="icpId" value={icpId} />
          <input type="hidden" name="criterionId" value={criterion.id} />
          <input type="hidden" name="decision" value="KEEP_ASYMMETRIC" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            Keep — confirm when found, never penalize when not found
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="icpId" value={icpId} />
          <input type="hidden" name="criterionId" value={criterion.id} />
          <input type="hidden" name="decision" value="MAKE_SUPPORTING" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-60"
          >
            Make supporting
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="icpId" value={icpId} />
          <input type="hidden" name="criterionId" value={criterion.id} />
          <input type="hidden" name="decision" value="REMOVE" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800 disabled:opacity-60"
          >
            Remove this criterion
          </button>
        </form>
      </div>
      {state && !state.ok ? (
        <p role="status" className="text-xs text-red-600">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function EvidenceClassSelect({
  productId,
  icpId,
  criterion,
}: {
  productId: string;
  icpId: string;
  criterion: IcpCriterionReviewRow;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    updateIcpEvidenceClassAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (!criterion.id) return null;
  const current = normalizeEvidenceClass(criterion.evidenceClass);

  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="icpId" value={icpId} />
      <input type="hidden" name="criterionId" value={criterion.id} />
      <label className="text-xs text-slate-600">
        Evidence source
        <select
          name="evidenceClass"
          defaultValue={current}
          disabled={pending}
          className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          <option value="LIST_DATA">From your list</option>
          <option value="COMPANY_RESEARCH">From company research</option>
          <option value="TARGETED_SEARCH">May not be verifiable online</option>
          <option value="SEMANTIC">AI judgment</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-slate-900 underline disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {state && !state.ok ? (
        <span className="text-xs text-red-600">{state.message}</span>
      ) : null}
    </form>
  );
}

function CriterionCard({
  productId,
  icpId,
  criterion,
  emphasize,
}: {
  productId: string;
  icpId: string;
  criterion: IcpCriterionReviewRow;
  emphasize?: boolean;
}) {
  const evidenceClass = normalizeEvidenceClass(criterion.evidenceClass);
  const label = evidenceClassAvailabilityLabel(evidenceClass);
  const fingerprint = criterionMaterialFingerprint({
    name: criterion.name,
    description: criterion.description,
    criterionType: criterion.criterionType,
    evidenceClass,
    operator: criterion.operator,
    targetValue: criterion.targetValue,
    minValue: criterion.minValue,
    maxValue: criterion.maxValue,
    allowedValues: criterion.allowedValues,
  });
  const needsDecision =
    evidenceClass === "TARGETED_SEARCH" &&
    isTargetedSearchDecisionStale({
      decision: criterion.targetedSearchDecision,
      storedFingerprint: criterion.targetedSearchDecisionFingerprint,
      currentFingerprint: fingerprint,
    });

  return (
    <li
      className={
        emphasize
          ? "rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950"
          : "rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800"
      }
      data-testid="icp-criterion-card"
      data-evidence-class={evidenceClass}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p>
          <span className="font-medium">
            {roleGlyph(criterion)}{" "}
            {formatCriterionDisplay({
              ...criterion,
              dataType: criterion.dataType as never,
              operator: criterion.operator as never,
              importance: criterion.importance as never,
              evidenceClass,
            })}
          </span>
          {criterion.manuallyEdited ? (
            <span className="ml-2 text-xs text-amber-700">(manual)</span>
          ) : null}
        </p>
        <span
          className={
            label.tone === "warning"
              ? "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950"
              : "rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
          }
          data-testid="evidence-class-label"
        >
          {label.label}
        </span>
      </div>
      {criterion.isRequired && evidenceClass === "TARGETED_SEARCH" ? (
        <p
          className="mt-2 text-xs text-amber-950"
          data-testid="required-targeted-warning"
        >
          &ldquo;{criterion.name}&rdquo; is required but may not be verifiable
          online. Most companies will be unresolvable until researched. Prefer
          &ldquo;Make supporting&rdquo; unless you accept asymmetric evaluation.
        </p>
      ) : null}
      <EvidenceClassSelect
        productId={productId}
        icpId={icpId}
        criterion={criterion}
      />
      {needsDecision ? (
        <DecisionForm productId={productId} icpId={icpId} criterion={criterion} />
      ) : evidenceClass === "TARGETED_SEARCH" &&
        criterion.targetedSearchDecision ? (
        <p className="mt-2 text-xs text-slate-600">
          Decision:{" "}
          {criterion.targetedSearchDecision === "KEEP_ASYMMETRIC"
            ? "Keep — never penalize when not found"
            : criterion.targetedSearchDecision === "MAKE_SUPPORTING"
              ? "Supporting"
              : criterion.targetedSearchDecision}
        </p>
      ) : null}
    </li>
  );
}

export function IcpCriteriaReview({
  title,
  productId,
  icpId,
  criteria,
  interpretationSummary,
  interpretationUndetermined,
}: {
  title: string;
  productId: string;
  icpId: string;
  criteria: IcpCriterionReviewRow[];
  interpretationSummary?: string | null;
  interpretationUndetermined?: string | null;
}) {
  if (criteria.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        No structured criteria yet. Save a natural-language definition, then run
        AI Interpretation.
      </p>
    );
  }

  const withClass = criteria.map((c) => ({
    ...c,
    evidenceClass: normalizeEvidenceClass(c.evidenceClass),
  }));

  const summary = buildEvidenceClassSummary(withClass);
  const targeted = withClass.filter((c) => c.evidenceClass === "TARGETED_SEARCH");
  const listData = withClass.filter((c) => c.evidenceClass === "LIST_DATA");
  const research = withClass.filter(
    (c) => c.evidenceClass === "COMPANY_RESEARCH",
  );
  const semantic = withClass.filter((c) => c.evidenceClass === "SEMANTIC");

  return (
    <div className="mt-4 space-y-4" data-testid="icp-criteria-review">
      <div>
        <h5 className="text-sm font-semibold text-slate-900">{title}</h5>
        {interpretationSummary?.trim() ? (
          <div
            className="mt-2 space-y-2 rounded-md border border-slate-300 bg-white px-3 py-3"
            data-testid="icp-interpretation-prose"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              What we understood
            </p>
            <p className="text-sm text-slate-800">{interpretationSummary.trim()}</p>
            {interpretationUndetermined?.trim() ? (
              <div data-testid="icp-interpretation-undetermined">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Could not be determined from available data
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-950">
                  {interpretationUndetermined
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Nothing in the definition was left undetermined.
              </p>
            )}
          </div>
        ) : null}
        <p
          className="mt-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900"
          data-testid="evidence-class-summary"
        >
          {summary}
        </p>
        <p className="mt-2 text-xs text-slate-600" data-testid="expectation-line">
          {EXPECTATION_SETTING_LINE}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ✓ required · ☆ supporting · ✗ disqualifier
        </p>
      </div>

      {listData.length > 0 ? (
        <section>
          <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From your list
          </h6>
          <ul className="mt-2 space-y-2">
            {listData.map((c) => (
              <CriterionCard
                key={c.id ?? c.name}
                productId={productId}
                icpId={icpId}
                criterion={c}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {research.length > 0 ? (
        <section>
          <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From company research
          </h6>
          <ul className="mt-2 space-y-2">
            {research.map((c) => (
              <CriterionCard
                key={c.id ?? c.name}
                productId={productId}
                icpId={icpId}
                criterion={c}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {targeted.length > 0 ? (
        <section
          className="rounded-md border border-red-300 bg-red-50/60 p-3"
          data-testid="targeted-search-section"
        >
          <h6 className="text-sm font-semibold text-red-950">
            {TARGETED_SEARCH_SECTION_TITLE}
          </h6>
          <p className="mt-1 text-xs text-red-900/90">
            {TARGETED_SEARCH_SECTION_BODY}
          </p>
          <ul className="mt-3 space-y-2">
            {targeted.map((c) => (
              <CriterionCard
                key={c.id ?? c.name}
                productId={productId}
                icpId={icpId}
                criterion={c}
                emphasize
              />
            ))}
          </ul>
        </section>
      ) : null}

      {semantic.length > 0 ? (
        <section>
          <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            AI judgment
          </h6>
          <ul className="mt-2 space-y-2">
            {semantic.map((c) => (
              <CriterionCard
                key={c.id ?? c.name}
                productId={productId}
                icpId={icpId}
                criterion={c}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
