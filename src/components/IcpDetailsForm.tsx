"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Icp } from "@prisma/client";
import { deleteIcpAction, upsertIcpAction } from "@/app/actions";
import { interpretIcpAction } from "@/app/actions/interpretation";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import { formatCriterionDisplay } from "@/lib/criteria/types";
import type { IcpActionResult, IcpFormValues } from "@/lib/icp/save";
import { listToCommaString } from "@/lib/utils";

type CriterionRow = {
  name: string;
  importance: string;
  isDisqualifier: boolean;
  isRequired: boolean;
  manuallyEdited?: boolean;
  dataType: string;
  operator: string;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  sortOrder: number;
  criterionType: string;
};

const initialResult: IcpActionResult | null = null;

function StatusBanner({
  result,
  testId = "icp-action-status",
}: {
  result: IcpActionResult | null;
  testId?: string;
}) {
  if (!result) return null;
  return (
    <p
      role="status"
      data-testid={testId}
      className={
        result.ok
          ? "mb-3 text-sm text-emerald-700"
          : "mb-3 text-sm text-red-600"
      }
    >
      {result.message}
    </p>
  );
}

function CriteriaReview({
  title,
  criteria,
}: {
  title: string;
  criteria: CriterionRow[];
}) {
  if (criteria.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        No structured criteria yet. Save a natural-language definition, then run
        AI Interpretation.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-md bg-slate-50 p-3">
      <h5 className="text-sm font-semibold text-slate-900">{title}</h5>
      <p className="mt-1 text-xs text-slate-500">
        ✓ required / strong · ☆ supporting · ✗ disqualifier
      </p>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {criteria.map((c, i) => (
          <li key={`${c.name}-${i}`}>
            {c.isDisqualifier ? "✗" : c.isRequired ? "✓" : "☆"}{" "}
            {formatCriterionDisplay({
              ...c,
              dataType: c.dataType as never,
              operator: c.operator as never,
              importance: c.importance as never,
            })}
            {c.manuallyEdited ? (
              <span className="ml-2 text-xs text-amber-700">(manual)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function defaultsFromIcp(icp?: Icp): Partial<IcpFormValues> {
  if (!icp) return {};
  return {
    id: icp.id,
    name: icp.name,
    description: icp.description ?? "",
    definition: icp.definition ?? icp.description ?? "",
    additionalContext: icp.additionalContext ?? "",
    targetIndustries: listToCommaString(icp.targetIndustries),
    minEmployees: icp.minEmployees != null ? String(icp.minEmployees) : "",
    maxEmployees: icp.maxEmployees != null ? String(icp.maxEmployees) : "",
    minRevenue: icp.minRevenue != null ? String(Number(icp.minRevenue)) : "",
    maxRevenue: icp.maxRevenue != null ? String(Number(icp.maxRevenue)) : "",
    targetGeographies: listToCommaString(icp.targetGeographies),
    requiredTechnologies: listToCommaString(icp.requiredTechnologies),
    positiveSignals: listToCommaString(icp.positiveSignals),
    negativeSignals: listToCommaString(icp.negativeSignals),
    notes: icp.notes ?? "",
  };
}

/** Existing ICP edit form — same fields; useActionState for save feedback. */
export function IcpDetailsForm({
  productId,
  productName,
  icp,
  criteria,
}: {
  productId: string;
  productName?: string;
  icp?: Icp;
  criteria: CriterionRow[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    upsertIcpAction,
    initialResult,
  );
  const [interpretState, interpretAction, interpretPending] = useActionState(
    interpretIcpAction,
    initialResult,
  );

  const definitionPlaceholder = productName?.trim()
    ? `Describe companies that should buy ${productName.trim()} — industry, size, geography, and other fit signals.`
    : "Describe the companies that should buy this product — industry, size, geography, and other fit signals.";

  const restored = state && !state.ok ? state.values : undefined;
  const defaults = useMemo(
    () => ({ ...defaultsFromIcp(icp), ...restored }),
    [icp, restored],
  );
  const formKey =
    state && !state.ok
      ? `icp-fail-${state.message}-${defaults.definition?.slice(0, 24) ?? ""}`
      : `icp-${icp?.id ?? "new"}`;

  useEffect(() => {
    if (!state?.ok || !state.icpId) return;
    if (!icp) {
      router.push(`/setup/${productId}/icps/${state.icpId}`);
      return;
    }
    router.refresh();
  }, [state, icp, productId, router]);

  useEffect(() => {
    if (interpretState?.ok) {
      router.refresh();
    }
  }, [interpretState, router]);

  function fieldHint(key: keyof IcpFormValues): string | undefined {
    if (!state || state.ok) return undefined;
    return state.fieldErrors?.[key];
  }

  return (
    <div className="rounded-md border border-slate-200 p-4" data-testid="icp-form">
      <StatusBanner result={state} />
      <form
        key={formKey}
        action={formAction}
        className="grid gap-4 md:grid-cols-2"
        data-testid="icp-details-form"
      >
        <input type="hidden" name="id" value={icp?.id ?? defaults.id ?? ""} />
        <input type="hidden" name="productId" value={productId} />
        <Field
          label="ICP Name"
          name="name"
          defaultValue={defaults.name}
          required
          hint={fieldHint("name")}
        />
        <Field
          label="Target Industries"
          name="targetIndustries"
          defaultValue={defaults.targetIndustries}
          placeholder="SaaS, Manufacturing"
          hint={fieldHint("targetIndustries")}
        />
        <div className="md:col-span-2">
          <Field
            label="Describe your ideal customer"
            name="definition"
            defaultValue={defaults.definition}
            as="textarea"
            placeholder={definitionPlaceholder}
            hint={fieldHint("definition")}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Additional context (optional)"
            name="additionalContext"
            defaultValue={defaults.additionalContext}
            as="textarea"
            hint={fieldHint("additionalContext")}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Short description (optional)"
            name="description"
            defaultValue={defaults.description}
            as="textarea"
            hint={fieldHint("description")}
          />
        </div>
        <Field
          label="Minimum Employees"
          name="minEmployees"
          type="number"
          defaultValue={defaults.minEmployees}
          hint={fieldHint("minEmployees")}
        />
        <Field
          label="Maximum Employees"
          name="maxEmployees"
          type="number"
          defaultValue={defaults.maxEmployees}
          hint={fieldHint("maxEmployees")}
        />
        <Field
          label="Minimum Revenue"
          name="minRevenue"
          type="number"
          defaultValue={defaults.minRevenue}
          hint={fieldHint("minRevenue")}
        />
        <Field
          label="Maximum Revenue"
          name="maxRevenue"
          type="number"
          defaultValue={defaults.maxRevenue}
          hint={fieldHint("maxRevenue")}
        />
        <Field
          label="Target Geographies"
          name="targetGeographies"
          defaultValue={defaults.targetGeographies}
          hint={fieldHint("targetGeographies")}
        />
        <Field
          label="Required Technologies"
          name="requiredTechnologies"
          defaultValue={defaults.requiredTechnologies}
          hint={fieldHint("requiredTechnologies")}
        />
        <Field
          label="Positive Buying Signals"
          name="positiveSignals"
          defaultValue={defaults.positiveSignals}
          hint={fieldHint("positiveSignals")}
        />
        <Field
          label="Negative / Disqualifying Signals"
          name="negativeSignals"
          defaultValue={defaults.negativeSignals}
          hint={fieldHint("negativeSignals")}
        />
        <div className="md:col-span-2">
          <Field
            label="Additional Notes"
            name="notes"
            defaultValue={defaults.notes}
            as="textarea"
            hint={fieldHint("notes")}
          />
        </div>
        <div className="md:col-span-2">
          <SubmitButton disabled={pending}>
            {pending ? "Saving…" : icp ? "Save ICP" : "Add ICP"}
          </SubmitButton>
        </div>
      </form>
      {icp ? (
        <>
          <CriteriaReview title="AI Interpretation" criteria={criteria} />
          <StatusBanner
            result={interpretState}
            testId="icp-interpret-status"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={interpretAction}>
              <input type="hidden" name="icpId" value={icp.id} />
              <input type="hidden" name="productId" value={productId} />
              <SecondaryButton type="submit" disabled={interpretPending}>
                {interpretPending
                  ? "Interpreting…"
                  : "Interpret / Reinterpret ICP"}
              </SecondaryButton>
            </form>
            <ConfirmDeleteForm
              action={deleteIcpAction}
              hiddenFields={{ id: icp.id, productId }}
              triggerLabel="Delete ICP"
              confirmTitle={`Delete ICP "${icp.name}"?`}
              confirmBody={`This will remove this ICP and its current generated criteria.\nHistorical scoring snapshots will not be changed.\nIf scoring runs reference this ICP, it will be archived instead of permanently deleted.`}
              confirmButtonLabel="Delete ICP"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
