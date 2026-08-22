"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Persona } from "@prisma/client";
import { upsertPersonaAction } from "@/app/actions";
import {
  deletePersonaAction,
} from "@/app/actions";
import {
  deletePersonaCriterionAction,
  saveAndInterpretPersonaAction,
  updatePersonaCriterionAction,
} from "@/app/actions/interpretation";
import { projectPersonaSignalsFromProfileAction } from "@/app/actions/persona-setup";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import { formatCriterionDisplay } from "@/lib/criteria/types";
import type { PersonaActionResult } from "@/lib/persona/save";
import { listToCommaString } from "@/lib/utils";

type CriterionRow = {
  id?: string;
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
  description?: string | null;
};

const initialResult: PersonaActionResult | null = null;

function StatusBanner({ result }: { result: PersonaActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      data-testid="persona-action-status"
      className={
        result.ok
          ? "mt-3 text-sm text-emerald-700"
          : "mt-3 text-sm text-red-600"
      }
    >
      {result.message}
    </p>
  );
}

function CriteriaReview({
  productId,
  personaId,
  criteria,
}: {
  productId: string;
  personaId: string;
  criteria: CriterionRow[];
}) {
  if (criteria.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        No structured criteria yet. Save the Persona definition, then run AI
        Interpretation.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-md bg-slate-50 p-3">
      <h5 className="text-sm font-semibold text-slate-900">
        AI Interpretation — review criteria
      </h5>
      <p className="mt-1 text-xs text-slate-500">
        ✓ required / strong · ☆ supporting · ✗ disqualifier. Manual edits are
        preserved on reinterpretation.
      </p>
      <ul className="mt-3 space-y-3 text-sm text-slate-700">
        {criteria.map((c, i) => {
          const role = c.isDisqualifier
            ? "disqualifier"
            : c.isRequired
              ? "required"
              : "supporting";
          return (
            <li
              key={c.id ?? `${c.name}-${i}`}
              className="rounded border border-slate-200 bg-white p-2"
            >
              <div>
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
              </div>
              {c.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <form
                    action={updatePersonaCriterionAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="criterionId" value={c.id} />
                    <input type="hidden" name="personaId" value={personaId} />
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="name" value={c.name} />
                    <label className="text-xs text-slate-600">
                      Role
                      <select
                        name="role"
                        defaultValue={role}
                        className="ml-1 rounded border border-slate-300 px-1 py-0.5 text-xs"
                      >
                        <option value="required">Required / strong</option>
                        <option value="supporting">Supporting</option>
                        <option value="disqualifier">Disqualifier</option>
                      </select>
                    </label>
                    <SecondaryButton type="submit">Update</SecondaryButton>
                  </form>
                  <form action={deletePersonaCriterionAction}>
                    <input type="hidden" name="criterionId" value={c.id} />
                    <input type="hidden" name="personaId" value={personaId} />
                    <input type="hidden" name="productId" value={productId} />
                    <SecondaryButton type="submit">Remove</SecondaryButton>
                  </form>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PersonaForm({
  productId,
  persona,
  criteria,
}: {
  productId: string;
  persona?: Persona;
  criteria: CriterionRow[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saveState, saveAction, savePending] = useActionState(
    upsertPersonaAction,
    initialResult,
  );
  const [interpretState, interpretAction, interpretPending] = useActionState(
    saveAndInterpretPersonaAction,
    initialResult,
  );
  const [projectState, projectAction, projectPending] = useActionState(
    projectPersonaSignalsFromProfileAction,
    initialResult,
  );

  const status = interpretState ?? saveState ?? projectState;
  const pending = savePending || interpretPending || projectPending;

  useEffect(() => {
    if (saveState?.ok && saveState.personaId && !persona) {
      router.refresh();
    }
    if (interpretState?.ok) {
      router.refresh();
    }
    if (projectState?.ok) {
      router.refresh();
    }
  }, [saveState, interpretState, projectState, persona, router]);

  return (
    <div
      className="rounded-md border border-slate-200 p-4"
      data-testid="persona-form"
    >
      <p className="mb-3 text-xs text-slate-500">
        Workflow: Persona definition → Save → AI Interpretation → Review
        criteria. AI is optional for saving.
      </p>
      <form
        ref={formRef}
        action={saveAction}
        className="grid gap-4 md:grid-cols-2"
      >
        <input type="hidden" name="id" value={persona?.id ?? ""} />
        <input type="hidden" name="productId" value={productId} />
        <Field
          label="Persona Name"
          name="name"
          defaultValue={persona?.name}
          required
        />
        <Field
          label="Likely Titles (evidence)"
          name="targetTitles"
          defaultValue={listToCommaString(persona?.targetTitles)}
          placeholder="CRO, VP Sales, Director of Sales"
          hint="Literal job titles only — not generic labels like “Sales Leader”."
        />
        <div className="md:col-span-2">
          <Field
            label="Describe the person who buys / cares"
            name="definition"
            defaultValue={persona?.definition ?? persona?.responsibilities}
            as="textarea"
            placeholder="The executive responsible for…"
            hint="Authoritative buyer-role narrative. Preserved as source data."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Additional context (optional)"
            name="additionalContext"
            defaultValue={persona?.additionalContext}
            as="textarea"
          />
        </div>
        <Field
          label="Department / Function"
          name="department"
          defaultValue={persona?.department}
          placeholder="Sales"
          hint="Organizational function (e.g. Sales, Finance) — not “Sales Leader”."
        />
        <Field
          label="Seniority"
          name="seniority"
          defaultValue={persona?.seniority}
          placeholder="Director through C-Suite"
          hint="Organizational level — distinct from title and function."
        />
        <div className="md:col-span-2">
          <Field
            label="Primary Responsibilities"
            name="responsibilities"
            defaultValue={persona?.responsibilities}
            as="textarea"
            hint="What they own, manage, decide, or are accountable for."
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Problems / Pain Points"
            name="painPoints"
            defaultValue={persona?.painPoints}
            as="textarea"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Desired Outcomes From Your Solution"
            name="desiredOutcomes"
            defaultValue={persona?.desiredOutcomes}
            as="textarea"
            hint="What does this person want to improve, achieve, reduce, or avoid by using a solution like yours? Not a campaign CTA (meeting, demo, reply)."
            placeholder="Reduce forecast administration time; improve forecast confidence…"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="Messaging Notes"
            name="messagingNotes"
            defaultValue={persona?.messagingNotes}
            as="textarea"
            hint="Communication guidance only — not automatic scoring criteria."
          />
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-2">
          <SubmitButton disabled={pending}>
            {savePending
              ? "Saving…"
              : persona
                ? "Save persona"
                : "Add persona"}
          </SubmitButton>
          <button
            type="submit"
            formAction={interpretAction}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {interpretPending
              ? "Interpreting…"
              : "Interpret / Reinterpret Persona"}
          </button>
        </div>
      </form>
      <StatusBanner result={status} />
      {persona ? (
        <>
          <CriteriaReview
            productId={productId}
            personaId={persona.id}
            criteria={criteria}
          />
          {persona.profileJson ? (
            <form action={projectAction} className="mt-3">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="personaId" value={persona.id} />
              <SecondaryButton type="submit" disabled={projectPending}>
                {projectPending
                  ? "Projecting…"
                  : "Project role signals from profile"}
              </SecondaryButton>
              <p className="mt-1 text-xs text-slate-500">
                Adds criteria from stored AI role signals (ownership, KPIs,
                positive/negative signals) without rewriting existing rows.
              </p>
            </form>
          ) : null}
          <div className="mt-3">
            <ConfirmDeleteForm
              action={deletePersonaAction}
              hiddenFields={{
                id: persona.id,
                productId,
              }}
              triggerLabel="Delete persona"
              confirmTitle={`Delete Persona "${persona.name}"?`}
              confirmBody={`This will remove this Persona and its current generated criteria.\nHistorical scoring snapshots will not be changed.\nIf scoring runs reference this Persona, it will be archived instead of permanently deleted.`}
              confirmButtonLabel="Delete Persona"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
