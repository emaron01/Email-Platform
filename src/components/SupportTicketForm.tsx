"use client";

import { useActionState } from "react";
import { createSupportTicketAction } from "@/app/actions/support";
import { SubmitButton } from "@/components/ui";

export function SupportTicketForm({ sourcePath }: { sourcePath: string }) {
  const [state, action] = useActionState(createSupportTicketAction, null);

  if (state?.ok) {
    return (
      <div
        role="status"
        data-testid="support-ticket-confirmation"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900"
      >
        {state.message}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" data-testid="support-ticket-form">
      <input type="hidden" name="sourcePath" value={sourcePath} />
      {state ? (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Subject</span>
        <input
          name="subject"
          required
          maxLength={120}
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Briefly describe what you need help with.
        </span>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Description</span>
        <textarea
          name="description"
          required
          maxLength={5000}
          rows={8}
          className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
      </label>
      <SubmitButton>Send support request</SubmitButton>
    </form>
  );
}
