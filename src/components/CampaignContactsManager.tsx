"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addContactsToCampaignAction,
  loadScoringRunQualificationAction,
  type CampaignContactsActionResult,
} from "@/app/actions/campaign-contacts";
import {
  contactListResearchGapAction,
  getResearchRunStatusAction,
  researchCompaniesForContactListAction,
  retryFailedResearchRunAction,
} from "@/app/actions/research";
import { createScoringRunAction, scoreContactsAction } from "@/app/actions/scoring";
import { QualificationBuckets } from "@/components/QualificationBuckets";
import type { QualificationBucketRow } from "@/components/QualificationBuckets";
import { SaveAndReturnToCampaignButton } from "@/components/SaveAndReturnToCampaignButton";
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "@/components/ui";
import {
  continueListPreparation,
  isQualificationException,
  LIST_PREPARATION_POLL_MS,
  runListPreparation,
  type ListPreparationDeps,
  type ListPreparationOutcome,
} from "@/lib/campaign/list-preparation";
import { listIndexHref } from "@/lib/lists/campaign-query";
import { ALL_PERSONAS_VALUE } from "@/lib/scoring/title-fit";

const initial: CampaignContactsActionResult | null = null;

/**
 * Search existing contacts stays in this file. Set this to true to show it again.
 */
export const SHOW_EXISTING_CONTACT_SEARCH = false;

export function CampaignContactsManager({
  campaignId,
  productId,
  icpId,
  personaId,
  lists,
  search,
  contacts,
  readOnly = false,
  readOnlyMessage,
}: {
  campaignId: string;
  productId: string;
  icpId: string;
  personaId: string | null;
  lists: Array<{ id: string; name: string }>;
  search: string;
  contacts: Array<{
    id: string;
    name: string;
    email: string | null;
    title: string | null;
    company: string | null;
    listName: string;
  }>;
  readOnly?: boolean;
  readOnlyMessage?: string;
}) {
  const router = useRouter();
  const [contactState, contactAction, contactPending] = useActionState(
    addContactsToCampaignAction,
    initial,
  );
  const generation = useRef(0);
  const [phase, setPhase] = useState<"idle" | "running" | "error" | "done">(
    "idle",
  );
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failureKind, setFailureKind] = useState<"research" | "scoring" | null>(
    null,
  );
  const [researchRunId, setResearchRunId] = useState<string | null>(null);
  const [scoringRunId, setScoringRunId] = useState<string | null>(null);
  const [companyRows, setCompanyRows] = useState<QualificationBucketRow[]>([]);
  const [contactRows, setContactRows] = useState<QualificationBucketRow[]>([]);

  useEffect(() => {
    if (contactState?.ok) router.refresh();
  }, [contactState, router]);

  function depsFor(listId: string, ticket: number): ListPreparationDeps {
    return {
      shouldContinue: () => generation.current === ticket,
      sleep: () =>
        new Promise((resolve) => {
          setTimeout(resolve, LIST_PREPARATION_POLL_MS);
        }),
      startResearch: async () => {
        const form = new FormData();
        form.set("contactListId", listId);
        form.set("forceRefresh", "0");
        return researchCompaniesForContactListAction(form);
      },
      pollStatus: (runId) => getResearchRunStatusAction(runId),
      researchGap: async () => {
        const gap = await contactListResearchGapAction(listId);
        if (!gap.ok) return gap;
        return { ok: true, needingResearch: gap.needingResearch };
      },
      createScoringRun: async () => {
        const form = new FormData();
        form.set("contactListId", listId);
        form.set("productId", productId);
        form.set("icpId", icpId);
        form.set("personaId", personaId ?? ALL_PERSONAS_VALUE);
        form.set("campaignId", campaignId);
        form.set("stayOnPage", "1");
        return createScoringRunAction(null, form);
      },
      scoreContacts: async (runId) => {
        const form = new FormData();
        form.set("scoringRunId", runId);
        return scoreContactsAction(form);
      },
    };
  }

  async function applyOutcome(ticket: number, outcome: ListPreparationOutcome) {
    if (generation.current !== ticket) return;
    if (outcome.type === "stop") {
      setResearchRunId(outcome.researchRunId);
      setFailureKind(outcome.kind);
      setErrorMessage(outcome.message);
      setNotice(null);
      setScoringRunId(null);
      setCompanyRows([]);
      setContactRows([]);
      setPhase("error");
      return;
    }
    const loaded = await loadScoringRunQualificationAction(outcome.scoringRunId);
    if (generation.current !== ticket) return;
    if (!loaded.ok) {
      setFailureKind("scoring");
      setErrorMessage(loaded.message);
      setNotice(null);
      setScoringRunId(null);
      setCompanyRows([]);
      setContactRows([]);
      setPhase("error");
      return;
    }
    setResearchRunId(null);
    setFailureKind(null);
    setErrorMessage(null);
    setNotice(outcome.message);
    setScoringRunId(outcome.scoringRunId);
    setCompanyRows(loaded.companyRows.filter((row) => isQualificationException(row.bucket)));
    setContactRows(loaded.contactRows.filter((row) => isQualificationException(row.bucket)));
    setPhase("done");
  }

  async function prepare(listId: string) {
    const ticket = ++generation.current;
    setSelectedListId(listId);
    setPhase("running");
    setErrorMessage(null);
    setNotice(null);
    setFailureKind(null);
    setResearchRunId(null);
    setScoringRunId(null);
    setCompanyRows([]);
    setContactRows([]);
    const outcome = await runListPreparation(depsFor(listId, ticket));
    await applyOutcome(ticket, outcome);
  }

  async function retry() {
    if (!selectedListId) return;
    const ticket = ++generation.current;
    const listId = selectedListId;
    setPhase("running");
    setErrorMessage(null);
    setNotice(null);
    const deps = depsFor(listId, ticket);
    if (!researchRunId) {
      const outcome = await runListPreparation(deps);
      await applyOutcome(ticket, outcome);
      return;
    }
    const retried = await retryFailedResearchRunAction(researchRunId);
    if (generation.current !== ticket) return;
    if (!retried.ok && retried.code === "NOTHING_TO_DO") {
      const outcome = await runListPreparation(deps);
      await applyOutcome(ticket, outcome);
      return;
    }
    const outcome = await continueListPreparation(deps, retried);
    await applyOutcome(ticket, outcome);
  }

  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Select an Existing List To Be Researched and Scored
        </h3>
        {lists.length > 0 ? (
          <div className="flex flex-col items-start gap-2">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                data-testid={`select-list-${list.id}`}
                disabled={readOnly || phase === "running"}
                onClick={() => void prepare(list.id)}
                className={PRIMARY_BUTTON_CLASS}
              >
                {list.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            <p>No lists yet.</p>
            {readOnly ? null : (
              <Link
                href={listIndexHref({ campaignId })}
                className="mt-2 inline-flex font-medium underline"
              >
                Create a list
              </Link>
            )}
          </div>
        )}
      </div>

      {readOnly && readOnlyMessage ? (
        <p className="text-sm text-slate-600">{readOnlyMessage}</p>
      ) : null}

      {phase === "running" ? (
        <div
          role="status"
          data-testid="list-preparation-status"
          className="flex items-center gap-3 text-sm text-slate-800"
        >
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
            aria-hidden
          />
          List preparation is underway.
        </div>
      ) : null}

      {phase === "error" && errorMessage ? (
        <div
          role="alert"
          data-testid="list-preparation-error"
          className="space-y-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"
        >
          <p>{errorMessage}</p>
          {failureKind === "research" && !readOnly ? (
            <button
              type="button"
              data-testid="list-preparation-retry"
              onClick={() => void retry()}
              className={SECONDARY_BUTTON_CLASS}
            >
              Retry research
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "done" && scoringRunId ? (
        <div className="space-y-5" data-testid="list-preparation-exceptions">
          {selectedList ? (
            <p className="text-sm text-slate-700">
              {selectedList.name} is prepared.
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-slate-700">
              {notice}
            </p>
          ) : null}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Companies that did not match
            </h3>
            {companyRows.length > 0 ? (
              <QualificationBuckets
                campaignId={campaignId}
                scoringRunId={scoringRunId}
                rows={companyRows}
                showSummary={false}
                emptyTitle="No companies were left out"
                emptyActionHref={`/campaigns/${campaignId}?stage=list`}
                emptyActionLabel="Back to list"
              />
            ) : (
              <p className="text-sm text-slate-600">None.</p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Contacts that did not match
            </h3>
            {contactRows.length > 0 ? (
              <QualificationBuckets
                campaignId={campaignId}
                scoringRunId={scoringRunId}
                rows={contactRows}
                showSummary={false}
                emptyTitle="No contacts were left out"
                emptyActionHref={`/campaigns/${campaignId}?stage=list`}
                emptyActionLabel="Back to list"
              />
            ) : (
              <p className="text-sm text-slate-600">None.</p>
            )}
          </section>
          <SaveAndReturnToCampaignButton
            campaignId={campaignId}
            scoringRunId={scoringRunId}
            testId="campaign-list-approve"
            label="Approve"
          />
        </div>
      ) : null}

      {SHOW_EXISTING_CONTACT_SEARCH ? (
        <section className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Search existing contacts
          </h3>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-sm">
              <span className="font-medium text-slate-700">Search</span>
              <input
                name="q"
                defaultValue={search}
                placeholder="Name, email, company, or title"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button type="submit" className={`${SECONDARY_BUTTON_CLASS}`}>
              Search
            </button>
            {search ? (
              <Link
                href={`/campaigns/${campaignId}?stage=list`}
                className="px-2 py-2 text-sm text-slate-600 underline"
              >
                Clear
              </Link>
            ) : null}
          </form>

          <form action={contactAction} className="mt-4 space-y-3">
            <input type="hidden" name="campaignId" value={campaignId} />
            {contactState ? (
              <p
                role="status"
                data-testid="campaign-contacts-status"
                className={
                  contactState.ok
                    ? "text-sm text-emerald-700"
                    : "text-sm text-red-600"
                }
              >
                {contactState.message}
              </p>
            ) : null}

            {contacts.length > 0 ? (
              <>
                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                  {contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        name="contactIds"
                        value={contact.id}
                        className="mt-1"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-slate-900">
                          {contact.name}
                        </span>
                        <span className="block text-slate-600">
                          {[contact.title, contact.company]
                            .filter(Boolean)
                            .join(" · ") || contact.email || "No role details"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {contact.email ?? "No email"} · {contact.listName}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={contactPending || readOnly}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  {contactPending ? "Adding…" : "Add selected contacts"}
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                {search
                  ? "No unattached contacts match this search."
                  : "No unattached contacts are available."}
              </p>
            )}
          </form>
        </section>
      ) : null}
    </div>
  );
}
