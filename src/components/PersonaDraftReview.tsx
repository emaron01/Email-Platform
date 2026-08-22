"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  retryPersonaSynthesisAction,
  saveApprovedPersonaFromRunAction,
  type PersonaSetupActionResult,
} from "@/app/actions/persona-setup";
import { Field, SecondaryButton, SubmitButton } from "@/components/ui";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import {
  buildPersonaCriteriaForReview,
  type PersonaCriterionFormRow,
} from "@/lib/persona-research/project-signals";

const initial: PersonaSetupActionResult | null = null;

type EditableCriterion = PersonaCriterionFormRow & { key: string };

function roleToFlags(role: "required" | "supporting" | "disqualifier"): {
  isRequired: boolean;
  isDisqualifier: boolean;
} {
  if (role === "disqualifier") {
    return { isRequired: false, isDisqualifier: true };
  }
  if (role === "required") {
    return { isRequired: true, isDisqualifier: false };
  }
  return { isRequired: false, isDisqualifier: false };
}

function flagsToRole(row: PersonaCriterionFormRow): "required" | "supporting" | "disqualifier" {
  if (row.isDisqualifier) return "disqualifier";
  if (row.isRequired) return "required";
  return "supporting";
}

function criterionTypeLabel(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes("positive") && lower.includes("signal")) {
    return "Positive role signal";
  }
  if (lower.includes("negative") && lower.includes("signal")) {
    return "Negative role signal";
  }
  if (lower.includes("ownership")) return "Ownership";
  if (lower.includes("responsib")) return "Responsibility / KPI";
  return type;
}

function PersonaCriteriaEditor({
  initialCriteria,
  onChange,
}: {
  initialCriteria: PersonaCriterionFormRow[];
  onChange: (rows: PersonaCriterionFormRow[]) => void;
}) {
  const [rows, setRows] = useState<EditableCriterion[]>(() =>
    initialCriteria.map((c, i) => ({
      ...c,
      key: `c-${i}-${c.criterionType}-${c.name}`,
    })),
  );

  useEffect(() => {
    onChange(rows.map(({ key: _key, ...rest }) => rest));
  }, [rows, onChange]);

  function updateRow(
    key: string,
    patch: Partial<EditableCriterion> & {
      role?: "required" | "supporting" | "disqualifier";
    },
  ) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch, manuallyEdited: true };
        if (patch.role) {
          Object.assign(next, roleToFlags(patch.role));
        }
        return next;
      }),
    );
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        name: "",
        criterionType: "responsibility",
        importance: "MEDIUM",
        isRequired: false,
        isDisqualifier: false,
        manuallyEdited: true,
      },
    ]);
  }

  return (
    <div className="md:col-span-2 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Scoring criteria & role signals
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Review projected ownership, KPI, and role signals before saving. ✓
          required · ☆ supporting · ✗ disqualifier. Manual edits are preserved
          on later reinterpretation.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No criteria yet. Add signals that distinguish this role from title
          alone.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.key}
              className="rounded border border-slate-200 bg-white p-3"
            >
              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
                <label className="block text-xs text-slate-600">
                  Criterion
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) =>
                      updateRow(row.key, { name: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="e.g. Owns sales forecasting process"
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  Type
                  <select
                    value={row.criterionType}
                    onChange={(e) =>
                      updateRow(row.key, { criterionType: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="positive_role_signal">
                      Positive role signal
                    </option>
                    <option value="negative_role_signal">
                      Negative role signal
                    </option>
                    <option value="ownership">Ownership</option>
                    <option value="responsibility">Responsibility / KPI</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-600">
                  Role
                  <select
                    value={flagsToRole(row)}
                    onChange={(e) =>
                      updateRow(row.key, {
                        role: e.target.value as
                          | "required"
                          | "supporting"
                          | "disqualifier",
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="required">Required / strong</option>
                    <option value="supporting">Supporting</option>
                    <option value="disqualifier">Disqualifier</option>
                  </select>
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  {criterionTypeLabel(row.criterionType)}
                </span>
                <SecondaryButton type="button" onClick={() => removeRow(row.key)}>
                  Remove
                </SecondaryButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <SecondaryButton type="button" onClick={addRow}>
        Add criterion
      </SecondaryButton>
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
  const initialCriteria = useMemo(
    () =>
      draft
        ? buildPersonaCriteriaForReview(draft, {
            maxCriteria: maxProjectedPersonaCriteria,
          }).criteria
        : [],
    [draft, maxProjectedPersonaCriteria],
  );
  const [criteriaJson, setCriteriaJson] = useState("[]");
  const handleCriteriaChange = useMemo(
    () => (rows: PersonaCriterionFormRow[]) => {
      setCriteriaJson(JSON.stringify(rows));
    },
    [],
  );

  useEffect(() => {
    if (draft) {
      setCriteriaJson(
        JSON.stringify(
          buildPersonaCriteriaForReview(draft, {
            maxCriteria: maxProjectedPersonaCriteria,
          }).criteria,
        ),
      );
    }
  }, [draft, maxProjectedPersonaCriteria]);

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
