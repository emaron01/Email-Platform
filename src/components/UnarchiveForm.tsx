"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CrudDeleteResult } from "@/lib/tenant/crud-delete";

type ArchiveAction = (
  prev: CrudDeleteResult | null,
  formData: FormData,
) => Promise<CrudDeleteResult>;

export function UnarchiveForm({
  action,
  idFieldName = "id",
  id,
  label,
}: {
  action: ArchiveAction;
  idFieldName?: string;
  id: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name={idFieldName} value={id} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          data-testid="unarchive-submit"
        >
          {pending ? "Restoring…" : label}
        </button>
      </form>
      {state && !state.ok ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.message}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
