"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrudDeleteResult } from "@/lib/tenant/crud-delete";

type DeleteAction = (
  prev: CrudDeleteResult | null,
  formData: FormData,
) => Promise<CrudDeleteResult>;

/**
 * Destructive delete with explicit confirmation copy (not browser confirm()).
 */
export function ConfirmDeleteForm({
  action,
  hiddenFields,
  confirmTitle,
  confirmBody,
  confirmButtonLabel,
  triggerLabel,
  onSuccessNavigate,
  tone = "danger",
  pendingLabel,
}: {
  action: DeleteAction;
  hiddenFields: Record<string, string>;
  confirmTitle: string;
  confirmBody: string;
  confirmButtonLabel: string;
  triggerLabel: string;
  onSuccessNavigate?: string;
  tone?: "danger" | "warning";
  pendingLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      if (onSuccessNavigate) {
        router.push(onSuccessNavigate);
      }
      router.refresh();
    }
  }, [state, router, onSuccessNavigate]);

  return (
    <div data-testid="confirm-delete">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {triggerLabel}
        </button>
      ) : (
        <div
          className={
            tone === "warning"
              ? "rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800"
              : "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-slate-800"
          }
          role="alertdialog"
          aria-labelledby="confirm-delete-title"
        >
          <p id="confirm-delete-title" className="font-semibold text-slate-900">
            {confirmTitle}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{confirmBody}</p>
          <form action={formAction} className="mt-3 flex flex-wrap gap-2">
            {Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="confirm" value="1" />
            <button
              type="submit"
              disabled={pending}
              className={
                tone === "warning"
                  ? "inline-flex items-center justify-center rounded-md bg-amber-700 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
                  : "inline-flex items-center justify-center rounded-md bg-red-700 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
              }
              data-testid="confirm-delete-submit"
            >
              {pending
                ? (pendingLabel ?? "Deleting…")
                : confirmButtonLabel}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
          </form>
        </div>
      )}
      {state && !state.ok ? (
        <p className="mt-2 text-sm text-red-600" role="alert" data-testid="delete-error">
          {state.message}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="mt-2 text-sm text-emerald-700" role="status" data-testid="delete-success">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
