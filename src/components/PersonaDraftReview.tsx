"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  retryPersonaSynthesisAction,
  saveApprovedPersonaFromRunAction,
  type PersonaSetupActionResult,
} from "@/app/actions/persona-setup";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import {
  buildPersonaCriteriaForReview,
  criteriaEditorBoxModified,
  criteriaToEditorBoxes,
  editorBoxesToCriteria,
  parseCriteriaBoxLines,
  researchGuidanceForBox,
  type CriteriaEditorBoxKey,
  type CriteriaEditorBoxes,
  type PersonaCriterionFormRow,
} from "@/lib/persona-research/project-signals";

const initial: PersonaSetupActionResult | null = null;

const BOX_META: Array<{
  key: CriteriaEditorBoxKey;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: "positiveRoleSignals",
    label: "Positive role signals",
    hint: "One signal per line. Type is fixed for this box.",
    placeholder: "e.g. Owns weekly forecast call",
  },
  {
    key: "exclusions",
    label: "Exclusions (disqualifiers)",
    hint: "One exclusion per line. Contacts matching these are disqualified.",
    placeholder: "e.g. Pure marketing scope only",
  },
  {
    key: "ownershipAreas",
    label: "Ownership areas",
    hint: "One ownership area per line.",
    placeholder: "e.g. Sales forecasting process",
  },
  {
    key: "responsibilities",
    label: "Responsibilities / KPIs",
    hint: "One responsibility or KPI per line.",
    placeholder: "e.g. Forecast accuracy",
  },
];

function BoxResearchGuidance({ notes }: { notes: string[] }) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        className="text-xs font-medium text-slate-600 underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? "Hide research notes"
          : `Research notes (${notes.length})`}
      </button>
      {open ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-500">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PersonaCriteriaEditor({
  initialCriteria,
  onChange,
}: {
  initialCriteria: PersonaCriterionFormRow[];
  onChange: (rows: PersonaCriterionFormRow[]) => void;
}) {
  const baseline = useMemo(() => initialCriteria, [initialCriteria]);
  const initialBoxes = useMemo(
    () => criteriaToEditorBoxes(baseline),
    [baseline],
  );
  const [boxes, setBoxes] = useState<CriteriaEditorBoxes>(initialBoxes);

  useEffect(() => {
    setBoxes(criteriaToEditorBoxes(baseline));
  }, [baseline]);

  useEffect(() => {
    const modifiedBoxes = (
      Object.keys(initialBoxes) as CriteriaEditorBoxKey[]
    ).filter((key) =>
      criteriaEditorBoxModified(initialBoxes[key], boxes[key]),
    );
    onChange(
      editorBoxesToCriteria(boxes, baseline, { modifiedBoxes }),
    );
  }, [boxes, baseline, initialBoxes, onChange]);

  function updateBox(key: CriteriaEditorBoxKey, value: string) {
    setBoxes((prev) => ({ ...prev, [key]: value }));
  }

  const exclusionsEmpty =
    parseCriteriaBoxLines(boxes.exclusions).length === 0;

  return (
    <div className="md:col-span-2 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Scoring criteria & role signals
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          One criterion per line in each box. Type and disqualifier role come
          from which box a line is in. Manual edits in a box are preserved on
          later reinterpretation.
        </p>
      </div>
      <div className="space-y-4">
        {BOX_META.map((meta) => {
          const guidance = researchGuidanceForBox(
            meta.key,
            boxes[meta.key],
            baseline,
          );
          return (
            <div key={meta.key}>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{meta.label}</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  {meta.hint}
                </span>
                <AutosizeTextarea
                  value={boxes[meta.key]}
                  onChange={(e) => updateBox(meta.key, e.target.value)}
                  minRows={3}
                  placeholder={meta.placeholder}
                  className="mt-1 w-full resize-none overflow-hidden rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
                />
              </label>
              <BoxResearchGuidance notes={guidance} />
              {meta.key === "exclusions" && exclusionsEmpty ? (
                <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  This persona has no exclusion criteria — no contact will be
                  disqualified.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PersonaDraftReview({
  productId,
  personaSetupRunId,
  draft,
  failed,
  errorSafe,
  maxProjectedPersonaCriteria = 15,
}: {
  productId: string;
  personaSetupRunId: string;
  draft: PersonaAiDraft | null;
  failed?: boolean;
  errorSafe?: string | null;
  maxProjectedPersonaCriteria?: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    saveApprovedPersonaFromRunAction,
    initial,
  );
  const [retry, retryAction, retryPending] = useActionState(
    retryPersonaSynthesisAction,
    initial,
  );
  const reviewResult = useMemo(
    () =>
      draft
        ? buildPersonaCriteriaForReview(draft, {
            maxCriteria: maxProjectedPersonaCriteria,
          })
        : {
            criteria: [],
            droppedCount: 0,
            unmappedCriterionTypes: [],
            missingExclusionCriteria: true,
          },
    [draft, maxProjectedPersonaCriteria],
  );
  const initialCriteria = reviewResult.criteria;
  const [criteriaJson, setCriteriaJson] = useState("[]");
  const handleCriteriaChange = useMemo(
    () => (rows: PersonaCriterionFormRow[]) => {
      setCriteriaJson(JSON.stringify(rows));
    },
    [],
  );

  useEffect(() => {
    if (draft) {
      setCriteriaJson(JSON.stringify(reviewResult.criteria));
    }
  }, [draft, reviewResult.criteria]);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/setup/${productId}`);
      router.refresh();
    }
  }, [state, productId, router]);

  useEffect(() => {
    if (retry?.ok && retry.personaSetupRunId) {
      router.push(`/setup/${productId}/personas/${retry.personaSetupRunId}`);
      router.refresh();
    }
  }, [retry, productId, router]);

  if (failed || !draft) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-900">
          {errorSafe ||
            "Persona synthesis could not be completed. Research evidence was preserved."}
        </p>
        <form action={retryAction} className="flex gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input
            type="hidden"
            name="personaSetupRunId"
            value={personaSetupRunId}
          />
          <SecondaryButton type="submit" disabled={retryPending}>
            {retryPending ? "Retrying…" : "Retry Persona Synthesis"}
          </SecondaryButton>
        </form>
        {retry ? (
          <p className="text-sm text-red-600">{retry.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="personaSetupRunId" value={personaSetupRunId} />
      <input type="hidden" name="criteriaJson" value={criteriaJson} />
      <Field label="Persona Name" name="name" required defaultValue={draft.name} />
      <Field
        label="Likely Titles"
        name="likelyTitles"
        defaultValue={draft.likelyTitles.join(", ")}
      />
      <Field
        label="Function"
        name="department"
        defaultValue={draft.departmentFunction ?? ""}
      />
      <Field
        label="Seniority"
        name="seniority"
        defaultValue={draft.seniority ?? ""}
      />
      <div className="md:col-span-2">
        <Field
          label="Role summary"
          name="definition"
          as="textarea"
          defaultValue={draft.roleSummary ?? ""}
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="Primary Responsibilities"
          name="responsibilities"
          as="textarea"
          defaultValue={draft.primaryResponsibilities.join("\n")}
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="Pain Points"
          name="painPoints"
          as="textarea"
          defaultValue={draft.painPoints.join("\n")}
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="Desired Outcomes From Your Solution"
          name="desiredOutcomes"
          as="textarea"
          defaultValue={draft.desiredOutcomesFromSolution.join("\n")}
          hint="Outcomes from using the product — not campaign CTAs."
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="Messaging Notes"
          name="messagingNotes"
          as="textarea"
          defaultValue={draft.messagingNotes.join("\n")}
        />
      </div>
      <PersonaCriteriaEditor
        initialCriteria={initialCriteria}
        onChange={handleCriteriaChange}
      />
      <div className="md:col-span-2">
        <SubmitButton disabled={pending}>
          {pending ? "Saving…" : "Review & Save Persona"}
        </SubmitButton>
      </div>
      {state ? (
        <p
          className={
            state.ok
              ? "md:col-span-2 text-sm text-emerald-700"
              : "md:col-span-2 text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
