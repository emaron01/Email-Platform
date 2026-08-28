"use client";

import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { refreshCompanyResearchAction } from "@/app/actions/research";

export function RefreshCompanyResearchForm({
  companyId,
  contactListId,
  label = "Refresh Research",
}: {
  companyId: string;
  contactListId?: string;
  label?: string;
}) {
  return (
    <ActionFeedbackForm action={refreshCompanyResearchAction}>
      <input type="hidden" name="companyId" value={companyId} />
      {contactListId ? (
        <input type="hidden" name="contactListId" value={contactListId} />
      ) : null}
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        {label}
      </button>
    </ActionFeedbackForm>
  );
}
