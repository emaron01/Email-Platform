import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignContactsManager } from "@/components/CampaignContactsManager";
import { CampaignEmailSettingsForm } from "@/components/CampaignEmailSettingsForm";
import { CampaignOfferForm } from "@/components/CampaignOfferForm";
import { EmailSequenceWorkspace } from "@/components/EmailSequenceWorkspace";
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
import {
  campaignOfferGuardContext,
  campaignOfferText,
  detectDeterministicOfferConflicts,
  offerConflictsFromJson,
} from "@/lib/campaign/offer-validation";
import { requireCurrentUser } from "@/lib/auth/session";
import { getEffectiveUsagePolicy } from "@/lib/usage/policy";

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
  const user = await requireCurrentUser();
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
  let usagePolicy;
  try {
    [campaign, availableContacts, scoringRuns, usagePolicy] =
      await Promise.all([
      getCampaignDetail(id),
      searchAvailableCampaignContacts(id, query.q),
      listCompatibleScoringRuns(id),
        getEffectiveUsagePolicy({
          organizationId: organization.id,
          userId: user.id,
        }),
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
  const storedOfferConflicts = offerConflictsFromJson(
    campaign.offerValidationJson,
  );
  const offer = {
    offerName,
    offerDescription,
    offerCta,
    offerNotes,
  };
  const guardContext = campaignOfferGuardContext({
    product: campaign.product,
    persona: campaign.persona,
  });
  const offerConflicts =
    storedOfferConflicts.length > 0
      ? storedOfferConflicts
      : detectDeterministicOfferConflicts({
          offerText: campaignOfferText(offer),
          claimsNotToMake: guardContext.claimsNotToMake,
          terminologyToAvoid: guardContext.terminologyToAvoid,
        });
  const offerConflictsAcknowledged =
    Boolean(campaign.offerConflictAcknowledgedAt) &&
    campaign.offerConflictAcknowledgedHash === campaign.offerValidationHash;

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
        title="Campaign offer"
        description="Offer claims are checked against current product materials when saved."
      >
        <CampaignOfferForm
          campaignId={campaign.id}
          offer={offer}
          conflicts={offerConflicts}
          conflictsAcknowledged={offerConflictsAcknowledged}
        />
      </Panel>

      <Panel
        title="Email settings"
        description="Control the length and campaign-specific guidance used for generated drafts."
      >
        <CampaignEmailSettingsForm
          campaignId={campaign.id}
          emailLength={campaign.emailLength}
          emailGuidance={campaign.emailGuidance}
        />
      </Panel>

      <Panel
        title={`Attached contacts (${campaign.contacts.length})`}
        description="Build one email at a time, mark it sent, then add the next sequence position."
      >
        {campaign.contacts.length > 0 ? (
          <div className="space-y-4">
            {campaign.contacts.map((campaignContact) => {
              const contact = campaignContact.contact;

              return (
                <section
                  key={campaignContact.id}
                  className="grid gap-4 rounded-md border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
                >
                  <EmailSequenceWorkspace
                    campaignContactId={campaignContact.id}
                    contactName={contactDisplayName(
                      contact.firstName,
                      contact.lastName,
                    )}
                    contactDetails={
                      [contact.title, contact.company]
                        .filter(Boolean)
                        .join(" · ") || "No role details"
                    }
                    contactEmail={contact.email}
                    contactStatus={campaignContact.status}
                    emailDeeplinkMaxUrlLength={
                      usagePolicy.emailDeeplinkMaxUrlLength
                    }
                    initialDrafts={campaignContact.emailDrafts
                      .filter(
                        (draft) => Boolean(draft.subject) && Boolean(draft.body),
                      )
                      .map((draft) => ({
                        id: draft.id,
                        sequenceNumber: draft.sequenceNumber,
                        subject: draft.subject ?? "",
                        body: draft.body ?? "",
                        status: draft.status,
                        kind: draft.kind,
                        sentAt: draft.sentAt?.toISOString() ?? null,
                        replyClassification: draft.replyClassification,
                        referralSuggested: draft.referralSuggested,
                      }))}
                    offerWarnings={
                      offerConflictsAcknowledged ? [] : offerConflicts
                    }
                  />
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
