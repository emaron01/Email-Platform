"use client";

import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { refreshCompanyResearchAction } from "@/app/actions/research";

export function RefreshCompanyResearchForm({
  companyId,
}: {
  companyId: string;
}) {
  return (
    <ActionFeedbackForm action={refreshCompanyResearchAction}>
      <input type="hidden" name="companyId" value={companyId} />
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Refresh Research
      </button>
    </ActionFeedbackForm>
  );
}
