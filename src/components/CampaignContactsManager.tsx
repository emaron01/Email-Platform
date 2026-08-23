"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addContactsToCampaignAction,
  addScoringRunContactsToCampaignAction,
  type CampaignContactsActionResult,
} from "@/app/actions/campaign-contacts";

const initial: CampaignContactsActionResult | null = null;

export function CampaignContactsManager({
  campaignId,
  search,
  contacts,
  scoringRuns,
}: {
  campaignId: string;
  search: string;
  contacts: Array<{
    id: string;
    name: string;
    email: string | null;
    title: string | null;
    company: string | null;
    listName: string;
  }>;
  scoringRuns: Array<{
    id: string;
    listName: string;
    status: "COMPLETED" | "PARTIAL";
    completedScoreCount: number;
    createdLabel: string;
  }>;
}) {
  const router = useRouter();
  const [contactState, contactAction, contactPending] = useActionState(
    addContactsToCampaignAction,
    initial,
  );
  const [runState, runAction, runPending] = useActionState(
    addScoringRunContactsToCampaignAction,
    initial,
  );

  useEffect(() => {
    if (contactState?.ok) router.refresh();
  }, [contactState, router]);

  useEffect(() => {
    if (runState?.ok) router.refresh();
  }, [runState, router]);

  return (
    <div className="space-y-6">
      <section>
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
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Search
          </button>
          {search ? (
            <Link
              href={`/campaigns/${campaignId}`}
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
                disabled={contactPending}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
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

      <section className="border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">
          Bulk add from a scored run
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Only completed scores from runs matching this campaign&apos;s
          Product, ICP, and Persona are available.
        </p>
        {scoringRuns.length > 0 ? (
          <form action={runAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="campaignId" value={campaignId} />
            <label className="min-w-72 flex-1 text-sm">
              <span className="font-medium text-slate-700">Scoring run</span>
              <select
                name="scoringRunId"
                required
                defaultValue=""
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select a scored run
                </option>
                {scoringRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.listName} · {run.completedScoreCount} scored ·{" "}
                    {run.status} · {run.createdLabel}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={runPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {runPending ? "Adding…" : "Add scored contacts"}
            </button>
            {runState ? (
              <p
                role="status"
                data-testid="campaign-scoring-run-status"
                className={
                  runState.ok
                    ? "w-full text-sm text-emerald-700"
                    : "w-full text-sm text-red-600"
                }
              >
                {runState.message}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            No compatible completed scoring runs are available.
          </p>
        )}
      </section>
    </div>
  );
}
