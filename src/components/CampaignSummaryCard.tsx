import Link from "next/link";
import type { ReactNode } from "react";
import { HomeCampaignStages } from "@/components/HomeCampaignStages";
import { formatDate } from "@/lib/utils";
import type {
  CampaignStage,
  CampaignStageKey,
} from "@/lib/workflow/campaign-stages";

export type CampaignSummary = {
  id: string;
  name: string;
  archived: boolean;
  context: string;
  companies: number;
  qualified: number;
  contacts: number;
  emailsToWrite: number;
  stages: CampaignStage[];
  currentStage: CampaignStageKey;
  productName: string;
  createdAt: string;
  visibility: "PERSONAL" | "SHARED";
  ownerUserId: string;
  ownerLabel: string;
};

export function CampaignSummaryCard({
  campaign,
  linkName = true,
  ownerLabel,
  actions,
}: {
  campaign: CampaignSummary;
  linkName?: boolean;
  ownerLabel?: string | null;
  actions?: ReactNode;
}) {
  return (
    <article
      className="rounded-xl border border-slate-200 bg-white p-5"
      data-testid={`campaign-summary-card-${campaign.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">
            {linkName ? (
              <Link
                href={`/campaigns/${campaign.id}`}
                className="hover:underline"
              >
                {campaign.name}
              </Link>
            ) : (
              <span>{campaign.name}</span>
            )}
            {campaign.visibility === "SHARED" ? (
              <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                Shared
              </span>
            ) : null}
            {campaign.archived ? (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Archived
              </span>
            ) : null}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {campaign.context || "Campaign setup"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Product {campaign.productName}
            <span className="px-2">·</span>
            Created {formatDate(campaign.createdAt)}
          </p>
          {ownerLabel ? (
            <p className="mt-1 text-sm text-slate-600">Owner: {ownerLabel}</p>
          ) : null}
        </div>
        {campaign.emailsToWrite > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800">
            {campaign.emailsToWrite} to write
          </span>
        ) : null}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Companies</dt>
          <dd className="font-semibold">{campaign.companies}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Qualified</dt>
          <dd className="font-semibold">{campaign.qualified}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Contacts</dt>
          <dd className="font-semibold">{campaign.contacts}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Emails to write</dt>
          <dd className="font-semibold">{campaign.emailsToWrite}</dd>
        </div>
      </dl>
      <HomeCampaignStages
        campaignId={campaign.id}
        stages={campaign.stages}
        currentStage={campaign.currentStage}
      />
      {actions ? <div className="mt-4">{actions}</div> : null}
    </article>
  );
}
