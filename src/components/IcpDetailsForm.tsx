import type { Icp } from "@prisma/client";
import {
  deleteIcpAction,
  upsertIcpAction,
} from "@/app/actions";
import { interpretIcpAction } from "@/app/actions/interpretation";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import { formatCriterionDisplay } from "@/lib/criteria/types";
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

/** Existing ICP edit form — same fields and actions as the prior inline form. */
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
  const definitionPlaceholder = productName?.trim()
    ? `Describe companies that should buy ${productName.trim()} — industry, size, geography, and other fit signals.`
    : "Describe the companies that should buy this product — industry, size, geography, and other fit signals.";

  return (
    <div className="rounded-md border border-slate-200 p-4">
      <form action={upsertIcpAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value={icp?.id ?? ""} />
        <input type="hidden" name="productId" value={productId} />
        <Field label="ICP Name" name="name" defaultValue={icp?.name} required />
        <Field
          label="Target Industries"
          name="targetIndustries"
          defaultValue={listToCommaString(icp?.targetIndustries)}
          placeholder="SaaS, Manufacturing"
        />
        <div className="md:col-span-2">
          <Field
            label="Describe your ideal customer"
            name="definition"
            defaultValue={icp?.definition ?? icp?.description}
            as="textarea"
            placeholder={definitionPlaceholder}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Additional context (optional)"
            name="additionalContext"
            defaultValue={icp?.additionalContext}
            as="textarea"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Short description (optional)"
            name="description"
            defaultValue={icp?.description}
            as="textarea"
          />
        </div>
        <Field
          label="Minimum Employees"
          name="minEmployees"
          type="number"
          defaultValue={icp?.minEmployees}
        />
        <Field
          label="Maximum Employees"
          name="maxEmployees"
          type="number"
          defaultValue={icp?.maxEmployees}
        />
        <Field
          label="Minimum Revenue"
          name="minRevenue"
          type="number"
          defaultValue={icp?.minRevenue != null ? Number(icp.minRevenue) : ""}
        />
        <Field
          label="Maximum Revenue"
          name="maxRevenue"
          type="number"
          defaultValue={icp?.maxRevenue != null ? Number(icp.maxRevenue) : ""}
        />
        <Field
          label="Target Geographies"
          name="targetGeographies"
          defaultValue={listToCommaString(icp?.targetGeographies)}
        />
        <Field
          label="Required Technologies"
          name="requiredTechnologies"
          defaultValue={listToCommaString(icp?.requiredTechnologies)}
        />
        <Field
          label="Positive Buying Signals"
          name="positiveSignals"
          defaultValue={listToCommaString(icp?.positiveSignals)}
        />
        <Field
          label="Negative / Disqualifying Signals"
          name="negativeSignals"
          defaultValue={listToCommaString(icp?.negativeSignals)}
        />
        <div className="md:col-span-2">
          <Field
            label="Additional Notes"
            name="notes"
            defaultValue={icp?.notes}
            as="textarea"
          />
        </div>
        <div className="md:col-span-2">
          <SubmitButton>{icp ? "Save ICP" : "Add ICP"}</SubmitButton>
        </div>
      </form>
      {icp ? (
        <>
          <CriteriaReview title="AI Interpretation" criteria={criteria} />
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={interpretIcpAction}>
              <input type="hidden" name="icpId" value={icp.id} />
              <input type="hidden" name="productId" value={productId} />
              <SecondaryButton type="submit">
                Interpret / Reinterpret ICP
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
