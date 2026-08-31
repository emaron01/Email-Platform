"use client";

import { useMemo, useState } from "react";
import type { QualificationBucket } from "@prisma/client";
import { EmailSequenceWorkspace } from "@/components/EmailSequenceWorkspace";
import type { OfferConflict } from "@/lib/campaign/offer-validation";
import type { ClaimValidationViolation } from "@/lib/email-generation/claim-validation-contract";
import type { CampaignEmailLength } from "@/lib/campaign/save";
import { sortEmailDraftContactsForSendQueue } from "@/lib/campaign/email-draft-contact-order";
import { QUALIFICATION_BUCKET_LABELS } from "@/lib/workflow/qualification";

export type EmailDraftsStageContact = {
  campaignContactId: string;
  contactId: string;
  contactName: string;
  contactDetails: string;
  contactEmail: string | null;
  contactStatus: string;
  suppressed: boolean;
  sequenceStopped: boolean;
  sequenceStoppedReason: string | null;
  qualificationBucket: QualificationBucket | null;
  personaOptions: Array<{ id: string; name: string }>;
  resolvedPersonaId: string | null;
  resolvedPersonaName: string | null;
  usedCampaignFallback: boolean;
  personalizationTier: "BEST" | "COMPANY" | "THIN";
  personalizationLabel: string;
  personalizationDetail: string;
  personalizationSources: string;
  drafts: Array<{
    id: string;
    sequenceNumber: number;
    subject: string;
    body: string;
    status: "DRAFT" | "APPROVED" | "SENDING" | "SENT" | "SKIPPED" | "NOT_CREATED";
    kind: "INITIAL" | "FOLLOW_UP" | "REPLY";
    sentAt: string | null;
    handoffAt: string | null;
    replyClassification:
      | "INTERESTED"
      | "OBJECTION"
      | "REFERRAL"
      | "NOT_NOW"
      | "NOT_INTERESTED"
      | null;
    referralSuggested: boolean;
    emailLength: CampaignEmailLength | null;
    personaId: string | null;
    personalizationTier: "BEST" | "COMPANY" | "THIN" | null;
    personalizationSources: string | null;
    claimConflicts: ClaimValidationViolation[];
  }>;
};

type ContactListFilter = "all" | "ready_to_send";

export function EmailDraftsStage({
  contacts,
  campaignEmailLength,
  offerWarnings,
  emailDeeplinkMaxUrlLength,
  mailboxConnection,
  dailySendUsage,
  readOnly = false,
}: {
  contacts: EmailDraftsStageContact[];
  campaignEmailLength: CampaignEmailLength;
  offerWarnings: OfferConflict[];
  emailDeeplinkMaxUrlLength: number;
  mailboxConnection: {
    status: "CONNECTED" | "RECONNECT_REQUIRED";
    mailboxAddress: string;
  } | null;
  dailySendUsage: {
    used: number;
    warningLimit: number;
    limit: number;
  };
  readOnly?: boolean;
}) {
  const [view, setView] = useState<"write" | "compare">("write");
  const [contactFilter, setContactFilter] =
    useState<ContactListFilter>("all");
  const [selectedId, setSelectedId] = useState(
    contacts[0]?.campaignContactId ?? "",
  );

  const visibleContacts = useMemo(() => {
    const filtered =
      contactFilter === "ready_to_send"
        ? contacts.filter((row) => row.drafts.length > 0)
        : contacts;
    return sortEmailDraftContactsForSendQueue(filtered);
  }, [contactFilter, contacts]);

  const selected =
    visibleContacts.find((row) => row.campaignContactId === selectedId) ??
    visibleContacts[0] ??
    null;

  if (contacts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView("write")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            view === "write"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          Write
        </button>
        <button
          type="button"
          data-testid="compare-drafts-toggle"
          onClick={() => setView("compare")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            view === "compare"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          Compare drafts
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">Show</span>
          <select
            data-testid="email-contacts-filter"
            value={contactFilter}
            onChange={(event) =>
              setContactFilter(event.target.value as ContactListFilter)
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="all">All contacts</option>
            <option value="ready_to_send">Ready to send</option>
          </select>
        </label>
      </div>

      {view === "compare" ? (
        visibleContacts.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
            No drafts are ready to send.
          </p>
        ) : (
          <CampaignDraftCompare contacts={visibleContacts} />
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <nav
            aria-label="Campaign contacts"
            className="rounded-md border border-slate-200 bg-slate-50 p-2"
          >
            <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Contacts
              {contactFilter === "ready_to_send"
                ? ` (${visibleContacts.length})`
                : ""}
            </p>
            {visibleContacts.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-600">
                No drafts are ready to send.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {visibleContacts.map((row) => {
                  const active =
                    row.campaignContactId === selected?.campaignContactId;
                  const draftCount = row.drafts.length;
                  return (
                    <li key={row.campaignContactId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.campaignContactId)}
                        className={`w-full rounded-md px-2 py-2 text-left text-sm ${
                          active
                            ? "bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-300"
                            : "text-slate-700 hover:bg-white"
                        }`}
                      >
                        <span className="block truncate">{row.contactName}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {row.contactDetails}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {row.qualificationBucket
                            ? QUALIFICATION_BUCKET_LABELS[
                                row.qualificationBucket
                              ]
                            : "Not scored"}
                          {" · "}
                          {draftCount === 0
                            ? "No draft"
                            : `${draftCount} draft${draftCount === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
          {selected ? (
            <section
              key={selected.campaignContactId}
              className="grid gap-4 rounded-md border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
            >
              <EmailSequenceWorkspace
                campaignContactId={selected.campaignContactId}
                contactId={selected.contactId}
                contactName={selected.contactName}
                contactDetails={selected.contactDetails}
                contactEmail={selected.contactEmail}
                contactStatus={selected.contactStatus}
                suppressed={selected.suppressed}
                sequenceStopped={selected.sequenceStopped}
                sequenceStoppedReason={selected.sequenceStoppedReason}
                readOnly={readOnly}
                emailDeeplinkMaxUrlLength={emailDeeplinkMaxUrlLength}
                mailboxConnection={mailboxConnection}
                dailySendUsage={dailySendUsage}
                campaignEmailLength={campaignEmailLength}
                personaOptions={selected.personaOptions}
                resolvedPersonaId={selected.resolvedPersonaId}
                resolvedPersonaName={selected.resolvedPersonaName}
                usedCampaignFallback={selected.usedCampaignFallback}
                personalizationTier={selected.personalizationTier}
                personalizationLabel={selected.personalizationLabel}
                personalizationDetail={selected.personalizationDetail}
                personalizationSources={selected.personalizationSources}
                initialDrafts={selected.drafts}
                offerWarnings={offerWarnings}
              />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CampaignDraftCompare({
  contacts,
}: {
  contacts: EmailDraftsStageContact[];
}) {
  const rows = useMemo(
    () =>
      contacts.map((contact) => {
        const draft =
          [...contact.drafts]
            .reverse()
            .find((entry) => entry.subject && entry.body) ?? null;
        return { contact, draft };
      }),
    [contacts],
  );

  return (
    <div
      data-testid="campaign-draft-compare"
      className="grid gap-4 md:grid-cols-2"
    >
      {rows.map(({ contact, draft }) => (
        <article
          key={contact.campaignContactId}
          className="rounded-md border border-slate-200 bg-white p-4"
        >
          <h3 className="text-sm font-medium text-slate-900">
            {contact.contactName}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{contact.contactDetails}</p>
          {draft ? (
            <>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
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
              <p className="mt-3 text-xs text-slate-500">
                {draft.personalizationTier ?? contact.personalizationTier}
                {draft.personalizationSources
                  ? ` · ${draft.personalizationSources}`
                  : contact.personalizationSources
                    ? ` · ${contact.personalizationSources}`
                    : ""}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No draft yet.</p>
          )}
        </article>
      ))}
    </div>
  );
}
