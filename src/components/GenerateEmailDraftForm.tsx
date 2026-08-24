"use client";

import { useState, useTransition } from "react";
import {
  generateEmailDraftAction,
  type GenerateEmailDraftActionResult,
} from "@/app/actions/email";
import { ADDITIONAL_GUIDANCE_MAX_CHARS } from "@/lib/email-generation/prompt";

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
  const [draft, setDraft] = useState<DisplayDraft | null>(
    existingDraft ?? null,
  );
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
  const [additionalGuidance, setAdditionalGuidance] = useState("");
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const nextResult = await generateEmailDraftAction(
        campaignContactId,
        draft ? additionalGuidance : undefined,
      );
      setResult(nextResult);
      if (
        nextResult.ok &&
        nextResult.draftId &&
        nextResult.subject &&
        nextResult.body
      ) {
        setDraft({
          draftId: nextResult.draftId,
          subject: nextResult.subject,
          body: nextResult.body,
        });
        setAdditionalGuidance("");
      }
    });
  }

  return (
    <div className="space-y-3" data-testid="email-draft-generator">
      {!draft ? (
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Generating…" : "Generate Email"}
        </button>
      ) : null}

      {draft ? (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              What should change?
            </span>
            <input
              type="text"
              value={additionalGuidance}
              onChange={(event) => setAdditionalGuidance(event.target.value)}
              maxLength={ADDITIONAL_GUIDANCE_MAX_CHARS}
              placeholder="What should change?"
              disabled={pending}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2 disabled:opacity-60"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Optional, up to {ADDITIONAL_GUIDANCE_MAX_CHARS} characters.
            </span>
          </label>
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {pending ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
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

      {draft ? (
        <article className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Subject
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {draft.subject}
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Body
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {draft.body}
          </p>
        </article>
      ) : null}
    </div>
  );
}
