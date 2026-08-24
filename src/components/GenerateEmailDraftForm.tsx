"use client";

import { useState, useTransition } from "react";
import {
  generateEmailDraftAction,
  type GenerateEmailDraftActionResult,
} from "@/app/actions/email";

type DisplayDraft = {
  draftId: string;
  subject: string;
  body: string;
};

export function GenerateEmailDraftForm({
  campaignContactId,
  existingDraft,
}: {
  campaignContactId: string;
  existingDraft?: DisplayDraft | null;
}) {
  const [result, setResult] =
    useState<GenerateEmailDraftActionResult | null>(
      existingDraft
        ? {
            ok: true,
            message: "Email draft generated.",
            ...existingDraft,
          }
        : null,
    );
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      setResult(await generateEmailDraftAction(campaignContactId));
    });
  }

  return (
    <div className="space-y-3" data-testid="email-draft-generator">
      {!result?.ok ? (
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Generating…" : "Generate Email"}
        </button>
      ) : null}

      {result ? (
        <div
          role="status"
          data-testid="email-generation-status"
        >
          <p
            className={
              result.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
            }
          >
            {result.message}
          </p>
          {result.ok ? (
            <p className="mt-1 text-xs text-slate-500">
              Make sure your signature is set in your Outlook or Gmail client —
              it will be appended automatically when you send.
            </p>
          ) : null}
        </div>
      ) : null}

      {result?.ok && result.subject && result.body ? (
        <article className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Subject
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {result.subject}
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Body
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {result.body}
          </p>
        </article>
      ) : null}
    </div>
  );
}
