import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignContactsManager } from "@/components/CampaignContactsManager";
import { GenerateEmailDraftForm } from "@/components/GenerateEmailDraftForm";
import {
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import {
  getCampaignDetail,
  listCompatibleScoringRuns,
  searchAvailableCampaignContacts,
} from "@/lib/campaign/contacts";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { contactDisplayName, formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
};

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
        {value || "—"}
      </dd>
    </div>
  );
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { id } = await params;
  const query = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Campaign" description="Campaign details." />
        <TenantMissing />
      </div>
    );
  }

  let campaign;
  let availableContacts;
  let scoringRuns;
  try {
    [campaign, availableContacts, scoringRuns] = await Promise.all([
      getCampaignDetail(id),
      searchAvailableCampaignContacts(id, query.q),
      listCompatibleScoringRuns(id),
    ]);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const offerName = campaign.offerName ?? campaign.offer?.name ?? null;
  const offerDescription =
    campaign.offerDescription ?? campaign.offer?.description ?? null;
  const offerCta = campaign.offerCta ?? campaign.offer?.primaryCta ?? null;
  const offerNotes = campaign.offerNotes ?? campaign.offer?.notes ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description="Campaign details, contacts, and first outbound drafts."
        actions={
          <Link
            href="/campaigns"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to campaigns
          </Link>
        }
      />

      <Panel title="Campaign context">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Status" value={campaign.status} />
          <Meta label="Product" value={campaign.product.name} />
          <Meta label="ICP" value={campaign.icp.name} />
          <Meta label="Persona" value={campaign.persona.name} />
          <Meta label="Offer" value={offerName} />
          <Meta label="Call to action" value={offerCta} />
          <Meta label="Offer description" value={offerDescription} />
          <Meta label="Offer notes" value={offerNotes} />
        </dl>
      </Panel>

      <Panel
        title={`Attached contacts (${campaign.contacts.length})`}
        description="Each contact has one first-email draft in this phase."
      >
        {campaign.contacts.length > 0 ? (
          <div className="space-y-4">
            {campaign.contacts.map((campaignContact) => {
              const contact = campaignContact.contact;
              const draft = campaignContact.emailDrafts[0] ?? null;
              const completeDraft =
                draft?.subject && draft.body
                  ? {
                      draftId: draft.id,
                      subject: draft.subject,
                      body: draft.body,
                    }
                  : null;

              return (
                <section
                  key={campaignContact.id}
                  className="grid gap-4 rounded-md border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
                >
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">
                      {contactDisplayName(
                        contact.firstName,
                        contact.lastName,
                      )}
                    </p>
                    <p className="text-slate-600">
                      {[contact.title, contact.company]
                        .filter(Boolean)
                        .join(" · ") || "No role details"}
                    </p>
                    <p className="text-slate-500">
                      {contact.email ?? "No email address"}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-3">
                      <Meta
                        label="Contact status"
                        value={campaignContact.status}
                      />
                      <Meta
                        label="Draft status"
                        value={draft?.status ?? "NOT_CREATED"}
                      />
                    </dl>
                  </div>

                  {draft && !completeDraft ? (
                    <p className="text-sm text-amber-700">
                      This contact has a draft record without displayable
                      content.
                    </p>
                  ) : (
                    <GenerateEmailDraftForm
                      campaignContactId={campaignContact.id}
                      existingDraft={completeDraft}
                    />
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            No contacts are attached yet. Add contacts below.
          </p>
        )}
      </Panel>

      <Panel
        title="Add contacts"
        description="Attach existing organization contacts individually or from a compatible scored run."
      >
        <CampaignContactsManager
          campaignId={campaign.id}
          search={query.q?.trim() ?? ""}
          contacts={availableContacts.map((contact) => ({
            id: contact.id,
            name: contactDisplayName(contact.firstName, contact.lastName),
            email: contact.email,
            title: contact.title,
            company: contact.company,
            listName: contact.contactList.name,
          }))}
          scoringRuns={scoringRuns.map((run) => ({
            id: run.id,
            listName: run.contactList.name,
            status: run.status,
            completedScoreCount: run.completedScoreCount,
            createdLabel: formatDate(run.createdAt),
          }))}
        />
      </Panel>
    </div>
  );
}
