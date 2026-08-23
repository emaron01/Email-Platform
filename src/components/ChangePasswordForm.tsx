"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  changePasswordAction,
  type AccountActionResult,
} from "@/app/actions/account";

const initial: AccountActionResult | null = null;

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3"
      data-testid="change-password-form"
    >
      {state ? (
        <p
          role="status"
          data-testid="change-password-status"
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
      <label className="block text-sm">
        Current password
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        New password
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
