"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFollowUpEmailAction,
  draftReplyAction,
  generateEmailDraftAction,
  markEmailDraftSentAction,
  regenerateEmailDraftAction,
  type GenerateEmailDraftActionResult,
} from "@/app/actions/email";
import { ADDITIONAL_GUIDANCE_MAX_CHARS } from "@/lib/email-generation/prompt";
import { PROSPECT_REPLY_MAX_CHARS } from "@/lib/email-generation/reply-contract";
import type { OfferConflict } from "@/lib/campaign/offer-validation";

type SequenceDraft = {
  id: string;
  sequenceNumber: number;
  subject: string;
  body: string;
  status: "DRAFT" | "APPROVED" | "SENT" | "SKIPPED" | "NOT_CREATED";
  kind: "INITIAL" | "FOLLOW_UP" | "REPLY";
  sentAt: string | null;
  replyClassification:
    | "INTERESTED"
    | "OBJECTION"
    | "REFERRAL"
    | "NOT_NOW"
    | "NOT_INTERESTED"
    | null;
  referralSuggested: boolean;
};

function sentDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function EmailSequenceWorkspace({
  campaignContactId,
  contactName,
  contactDetails,
  contactEmail,
  contactStatus,
  initialDrafts,
  offerWarnings,
}: {
  campaignContactId: string;
  contactName: string;
  contactDetails: string;
  contactEmail: string;
  contactStatus: string;
  initialDrafts: SequenceDraft[];
  offerWarnings: OfferConflict[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDrafts.at(-1)?.id ?? null,
  );
  const [result, setResult] =
    useState<GenerateEmailDraftActionResult | null>(null);
  const [regenerationGuidance, setRegenerationGuidance] = useState("");
  const [replyText, setReplyText] = useState("");
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [pending, startTransition] = useTransition();
  const latest = drafts.at(-1) ?? null;
  const selected =
    drafts.find((draft) => draft.id === selectedId) ?? latest ?? null;
  const canAdd = Boolean(latest?.status === "SENT" && latest.sentAt);
  const addDisabledReason = latest
    ? `Email ${latest.sequenceNumber} must be marked as sent first.`
    : "Generate Email 1 first.";
  const displayWarnings = useMemo(
    () => result?.offerWarnings ?? offerWarnings,
    [result, offerWarnings],
  );

  function applyGenerated(next: GenerateEmailDraftActionResult) {
    setResult(next);
    if (
      !next.ok ||
      !next.draftId ||
      !next.subject ||
      !next.body ||
      !next.sequenceNumber ||
      !next.kind
    ) {
      return;
    }
    const nextDraft: SequenceDraft = {
      id: next.draftId,
      sequenceNumber: next.sequenceNumber,
      subject: next.subject,
      body: next.body,
      status: next.status ?? "DRAFT",
      kind: next.kind,
      sentAt: null,
      replyClassification: next.replyClassification ?? null,
      referralSuggested: next.referralSuggested ?? false,
    };
    setDrafts((current) => {
      const exists = current.some((draft) => draft.id === nextDraft.id);
      return exists
        ? current.map((draft) =>
            draft.id === nextDraft.id ? nextDraft : draft,
          )
        : [...current, nextDraft].sort(
            (a, b) => a.sequenceNumber - b.sequenceNumber,
          );
    });
    setSelectedId(nextDraft.id);
    setRegenerationGuidance("");
    setReplyText("");
    setShowReplyBox(false);
    router.refresh();
  }

  function run(action: () => Promise<GenerateEmailDraftActionResult>) {
    startTransition(async () => applyGenerated(await action()));
  }

  function markSent() {
    if (!selected) return;
    startTransition(async () => {
      const next = await markEmailDraftSentAction(selected.id);
      setResult(next);
      if (next.ok) {
        setDrafts((current) =>
          current.map((draft) =>
            draft.id === selected.id
              ? {
                  ...draft,
                  status: "SENT",
                  sentAt: new Date().toISOString(),
                }
              : draft,
          ),
        );
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="text-sm">
        <p className="font-medium text-slate-900">{contactName}</p>
        <p className="text-slate-600">{contactDetails}</p>
        <p className="text-slate-500">{contactEmail}</p>
        <dl className="mt-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Contact status
          </dt>
          <dd className="mt-1 text-sm text-slate-900">{contactStatus}</dd>
        </dl>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Sequence
          </p>
          <div className="mt-2 space-y-2">
            {drafts.map((draft) => {
              const isSelected = draft.id === selected?.id;
              const isCurrent = draft.id === latest?.id;
              return (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(draft.id);
                    setShowReplyBox(false);
                    setResult(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
                    isSelected
                      ? "border-slate-900 bg-slate-100"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span>
                    <span className="font-medium">Email {draft.sequenceNumber}</span>{" "}
                    <span
                      className={
                        draft.status === "SENT"
                          ? "text-emerald-700"
                          : "text-amber-700"
                      }
                    >
                      {draft.status}
                    </span>
                    {draft.sentAt ? ` · ${sentDate(draft.sentAt)}` : ""}
                  </span>
                  <span className="text-slate-500">
                    {isSelected
                      ? draft.status === "SENT"
                        ? "viewing"
                        : "editing"
                      : "view"}
                    {isCurrent ? " · current" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!canAdd || pending}
            title={canAdd ? "Generate the next email." : addDisabledReason}
            onClick={() =>
              run(() => addFollowUpEmailAction(campaignContactId))
            }
            className="mt-3 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            + Add to sequence
          </button>
          {!canAdd ? (
            <p className="mt-1 text-xs text-slate-500">{addDisabledReason}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {displayWarnings.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
              Unacknowledged offer conflicts
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {displayWarnings.map((warning) => (
                <li key={`${warning.code}-${warning.message}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800">
              Generation remains available. Review or acknowledge these in the
              Campaign offer panel.
            </p>
          </div>
        ) : null}

        {result ? (
          <div role="status" data-testid="email-sequence-status">
            <p
              className={
                result.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
              }
            >
              {result.message}
            </p>
            {result.referralSuggested ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Referral detected. A new contact may need to be added; no
                contact was created automatically.
              </p>
            ) : null}
          </div>
        ) : null}

        {!selected ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => generateEmailDraftAction(campaignContactId))
            }
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Generating…" : "Generate Email 1"}
          </button>
        ) : (
          <>
            {selected.id !== latest?.id ? (
              <button
                type="button"
                onClick={() => setSelectedId(latest?.id ?? null)}
                className="text-sm font-medium text-slate-700 underline"
              >
                Return to current draft
              </button>
            ) : null}

            <article
              className={`rounded-md border p-4 ${
                selected.status === "SENT"
                  ? "border-slate-200 bg-slate-50"
                  : "border-slate-400 bg-white shadow-sm"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email {selected.sequenceNumber} · {selected.kind}
                </p>
                <span className="text-xs font-medium text-slate-600">
                  {selected.status}
                </span>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Subject
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {selected.subject}
              </p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Body
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {selected.body}
              </p>
            </article>

            {selected.status !== "SENT" ? (
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    What should change?
                  </span>
                  <input
                    type="text"
                    value={regenerationGuidance}
                    onChange={(event) =>
                      setRegenerationGuidance(event.target.value)
                    }
                    maxLength={ADDITIONAL_GUIDANCE_MAX_CHARS}
                    disabled={pending}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        regenerateEmailDraftAction(
                          selected.id,
                          regenerationGuidance,
                        ),
                      )
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                  >
                    {pending ? "Regenerating…" : "Regenerate"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={markSent}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    I sent this — mark as sent
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  This records your assertion that you sent the email. It is
                  not a delivery confirmation.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Sent emails are read-only.
                </p>
                <button
                  type="button"
                  disabled={!canAdd || pending}
                  title={
                    canAdd
                      ? "Paste the prospect reply."
                      : "Mark the current draft as sent before adding a reply."
                  }
                  onClick={() => setShowReplyBox((value) => !value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Draft reply
                </button>
              </div>
            )}

            {showReplyBox && selected.status === "SENT" ? (
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    Paste what the prospect wrote
                  </span>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    maxLength={PROSPECT_REPLY_MAX_CHARS}
                    rows={5}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || !replyText.trim()}
                  onClick={() =>
                    run(() => draftReplyAction(selected.id, replyText))
                  }
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? "Classifying and drafting…" : "Classify and draft reply"}
                </button>
              </div>
            ) : null}

            <p className="text-xs text-slate-500">
              Make sure your signature is set in your Outlook or Gmail client.
              It will be appended automatically when you send.
            </p>
          </>
        )}
      </div>
    </>
  );
}
