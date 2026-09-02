import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCampaignAction, archiveCampaignAction, unarchiveCampaignAction } from "@/app/actions";
import { CampaignContactsManager } from "@/components/CampaignContactsManager";
import { CampaignEmailSettingsForm } from "@/components/CampaignEmailSettingsForm";
import { CampaignOfferForm } from "@/components/CampaignOfferForm";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { UnarchiveForm } from "@/components/UnarchiveForm";
import { EmailDraftsStage } from "@/components/EmailDraftsStage";
import { CampaignStageRail } from "@/components/CampaignStageRail";
import { QualificationBuckets } from "@/components/QualificationBuckets";
import { PageHeader, Panel, TenantMissing } from "@/components/ui";
import { campaignDeleteConfirmBody } from "@/lib/tenant/campaign-delete";
import { campaignArchiveConfirmBody } from "@/lib/tenant/campaign-archive";
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import {
  getCampaignDetail,
  getCampaignQualificationView,
  listCompatibleScoringRuns,
  searchAvailableCampaignContacts,
} from "@/lib/campaign/contacts";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { contactDisplayName, formatDate } from "@/lib/utils";
import { claimConflictsFromJson } from "@/lib/email-generation/claim-conflicts";
import { requireCurrentUser } from "@/lib/auth/session";
import { getEffectiveUsagePolicy } from "@/lib/usage/policy";
import { getMailboxConnectionView } from "@/lib/mailbox/data";
import { getDailyEmailSendUsage } from "@/lib/usage/quota";
import { listVoiceSamplesForUser } from "@/lib/voice/samples";
import {
  buildCampaignStages,
  resolveCampaignStage,
} from "@/lib/workflow/campaign-stages";
import { parseEmailLength } from "@/lib/campaign/save";
import { campaignPersonasDisplayName } from "@/lib/campaign/personas";
import { loadEmailDraftScreenStates } from "@/lib/email-generation/context";
import { emailDraftStaleness } from "@/lib/email-generation/draft-staleness";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; stage?: string }>;
};

function asPersonalizationTier(
  value: string | null | undefined,
): "BEST" | "COMPANY" | "THIN" | null {
  if (value === "BEST" || value === "COMPANY" || value === "THIN") return value;
  return null;
}

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
  let mailboxConnection;
  let dailySendUsage;
  let qualification;
  let voiceSamples;
  try {
    [
      campaign,
      availableContacts,
      scoringRuns,
      usagePolicy,
      mailboxConnection,
      dailySendUsage,
      qualification,
      voiceSamples,
    ] = await Promise.all([
      getCampaignDetail(id),
      searchAvailableCampaignContacts(id, query.q),
      listCompatibleScoringRuns(id),
      getEffectiveUsagePolicy({
        organizationId: organization.id,
        userId: user.id,
      }),
      getMailboxConnectionView({
        organizationId: organization.id,
        userId: user.id,
      }),
      getDailyEmailSendUsage({
        organizationId: organization.id,
        userId: user.id,
      }),
      getCampaignQualificationView(id),
      listVoiceSamplesForUser({
        organizationId: organization.id,
        userId: user.id,
      }),
    ]);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const campaignArchived = campaign.archivedAt != null;
  const suppressedEmails = await listActiveNormalizedEmails(
    organization.id,
    campaign.contacts.map((entry) => entry.contact.email),
  );

  const draftScreens = await loadEmailDraftScreenStates({
    organizationId: organization.id,
    productId: campaign.productId,
    icpId: campaign.icpId,
    campaignPersonaId: campaign.personaId,
    campaignPersonaName: campaign.persona?.name ?? null,
    inPlay: campaign.personasInPlay.map((row) => ({
      personaId: row.personaId,
      name: row.persona.name,
    })),
    productPersonas: campaign.product.personas,
    contacts: campaign.contacts.map((entry) => ({
      campaignContactId: entry.id,
      contactId: entry.contact.id,
      companyId: entry.contact.companyId,
      chosenPersonaId: entry.chosenPersonaId,
      storedPersonaId:
        [...entry.emailDrafts]
          .reverse()
          .find((draft) => draft.personaId)?.personaId ?? null,
    })),
  });

  const companyIds = [
    ...new Set(
      campaign.contacts
        .map((entry) => entry.contact.companyId)
        .filter((companyId): companyId is string => Boolean(companyId)),
    ),
  ];
  const companyResearchRows =
    companyIds.length > 0
      ? await prisma.companyResearch.findMany({
          where: {
            organizationId: organization.id,
            companyId: { in: companyIds },
            researchedAt: { not: null },
          },
          orderBy: { researchedAt: "desc" },
          select: { companyId: true, researchedAt: true },
        })
      : [];
  const companyResearchUpdatedAtByCompanyId = new Map<string, string>();
  for (const row of companyResearchRows) {
    if (!row.companyId || !row.researchedAt) continue;
    if (!companyResearchUpdatedAtByCompanyId.has(row.companyId)) {
      companyResearchUpdatedAtByCompanyId.set(
        row.companyId,
        row.researchedAt.toISOString(),
      );
    }
  }

  const personaUpdatedAtById = new Map<string, string>();
  for (const persona of campaign.product.personas) {
    personaUpdatedAtById.set(persona.id, persona.updatedAt.toISOString());
  }
  for (const row of campaign.personasInPlay) {
    personaUpdatedAtById.set(row.persona.id, row.persona.updatedAt.toISOString());
  }
  if (campaign.persona) {
    personaUpdatedAtById.set(
      campaign.persona.id,
      campaign.persona.updatedAt.toISOString(),
    );
  }
  const productUpdatedAt = campaign.product.updatedAt.toISOString();

  const offerName = campaign.offerName ?? campaign.offer?.name ?? null;
  const offerDescription =
    campaign.offerDescription ?? campaign.offer?.description ?? null;
  const offerCta = campaign.offerCta ?? campaign.offer?.primaryCta ?? null;
  const offerNotes = campaign.offerNotes ?? campaign.offer?.notes ?? null;
  const offer = {
    offerName,
    offerDescription,
    offerCta,
    offerNotes,
  };
  const generatedEmailCount = campaign.contacts.reduce(
    (total, entry) => total + entry.emailDrafts.length,
    0,
  );
  const sentEmailCount = campaign.contacts.reduce(
    (total, entry) =>
      total +
      entry.emailDrafts.filter((draft) => draft.status === "SENT").length,
    0,
  );
  const attachedContactIds = new Set(
    campaign.contacts.map((entry) => entry.contact.id),
  );
  const attachedCompanyIds = new Set(
    campaign.contacts
      .map((entry) => entry.contact.companyId)
      .filter((value): value is string => Boolean(value)),
  );
  const attachedCompanyNames = new Set(
    campaign.contacts
      .map((entry) => entry.contact.company?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const campaignCompanyRows = qualification.companyRows.filter((row) =>
    row.canOverride
      ? attachedCompanyIds.has(row.id)
      : attachedCompanyNames.has(row.name.trim().toLowerCase()),
  );
  const campaignContactRows = qualification.contactRows.filter((row) =>
    attachedContactIds.has(row.id),
  );
  const excludedCompanyIds = new Set(
    campaignCompanyRows
      .filter((row) => row.bucket === "EXCLUDED" && row.canOverride)
      .map((row) => row.id),
  );
  const survivingContactRows = campaignContactRows.filter(
    (row) => !row.companyId || !excludedCompanyIds.has(row.companyId),
  );
  const qualifiedContactCount = survivingContactRows.filter(
    (row) => row.bucket === "GOOD",
  ).length;
  const personasLabel = campaignPersonasDisplayName({
    fallbackPersonaName: campaign.persona?.name,
    inPlayNames: campaign.personasInPlay.map((row) => row.persona.name),
    productPersonaCount: campaign.product.personas.length,
  });
  const setupComplete = Boolean(
    campaign.productId &&
    campaign.icpId &&
    (offerName || campaign.offerId),
  );
  const stages = buildCampaignStages({
    setupComplete,
    hasListData: campaign.contacts.length > 0,
    companyResultCount: campaignCompanyRows.length,
    survivingCompanyCount: campaignCompanyRows.filter(
      (row) => row.bucket === "GOOD",
    ).length,
    qualifiedContactCount,
    generatedEmailCount,
    sentEmailCount,
  });
  const currentStage = resolveCampaignStage(query.stage, stages);
  const bucketByContactId = new Map(
    campaignContactRows.map((row) => [row.id, row.bucket]),
  );
  const stageContacts = campaign.contacts;
  const companyCount = new Set(
    campaign.contacts
      .map((entry) => entry.contact.company?.trim().toLowerCase())
      .filter(Boolean),
  ).size;
  const qualifiedCompanyCount = campaignCompanyRows.filter(
    (row) => row.bucket === "GOOD",
  ).length;
  const sequencePositionsReached = campaign.contacts.reduce(
    (maximum, entry) =>
      Math.max(
        maximum,
        ...entry.emailDrafts
          .filter((draft) => draft.status === "SENT")
          .map((draft) => draft.sequenceNumber),
      ),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`Stage ${stages.find((stage) => stage.key === currentStage)?.number}: ${stages.find((stage) => stage.key === currentStage)?.label}`}
        actions={
          <div className="flex flex-col items-end gap-2">
            <Link
              href="/campaigns"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to campaigns
            </Link>
            {campaignArchived ? (
              <UnarchiveForm
                action={unarchiveCampaignAction}
                id={campaign.id}
                label="Unarchive campaign"
              />
            ) : (
              <ConfirmDeleteForm
                action={archiveCampaignAction}
                hiddenFields={{ id: campaign.id }}
                triggerLabel="Archive campaign"
                confirmTitle={`Archive campaign "${campaign.name}"?`}
                confirmBody={campaignArchiveConfirmBody()}
                confirmButtonLabel="Archive campaign"
                tone="warning"
                pendingLabel="Archiving…"
              />
            )}
            <ConfirmDeleteForm
              action={deleteCampaignAction}
              hiddenFields={{ id: campaign.id }}
              triggerLabel="Delete campaign"
              confirmTitle={`Delete campaign "${campaign.name}"?`}
              confirmBody={campaignDeleteConfirmBody({
                contactCount: campaign.contacts.length,
                draftCount: generatedEmailCount,
                sentCount: sentEmailCount,
              })}
              confirmButtonLabel="Delete campaign"
              onSuccessNavigate="/campaigns"
            />
          </div>
        }
      />
      {campaignArchived ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This campaign is archived. History is intact. Unarchive it to generate
          emails or change contacts.
        </div>
      ) : null}
      <CampaignStageRail
        campaignId={campaign.id}
        stages={stages}
        currentStage={currentStage}
      />

      {currentStage === "setup" ? (
        <>
          <Panel
            title="4 Setup"
            description="Campaign selections reuse approved setup records. Existing selections are shown read-only so qualification history is not silently reinterpreted."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="font-medium text-slate-700">
                  Campaign name
                </span>
                <input
                  value={campaign.name}
                  readOnly
                  className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2"
                />
              </label>
              {[
                ["Product", campaign.product.id, campaign.product.name],
                ["ICP", campaign.icp.id, campaign.icp.name],
                ["Personas", "personas-in-play", personasLabel],
                [
                  "Offer",
                  campaign.offer?.id ?? "campaign-offer",
                  offerName ?? "No offer selected",
                ],
              ].map(([label, value, display]) => (
                <label key={label} className="text-sm">
                  <span className="font-medium text-slate-700">{label}</span>
                  <select
                    value={value}
                    disabled
                    className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2"
                  >
                    <option value={value}>{display}</option>
                  </select>
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Campaign context">
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Meta label="Status" value={campaign.status} />
              <Meta label="Product" value={campaign.product.name} />
              <Meta label="ICP" value={campaign.icp.name} />
              <Meta label="Personas in play" value={personasLabel} />
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
            {campaignArchived ? (
              <p className="text-sm text-slate-600">
                Offer settings are read-only while this campaign is archived.
              </p>
            ) : (
              <CampaignOfferForm
                campaignId={campaign.id}
                offer={offer}
              />
            )}
          </Panel>

          <Panel
            title="Email settings"
            description="Default length and campaign-specific guidance. Length can be overridden on each draft."
          >
            {campaignArchived ? (
              <p className="text-sm text-slate-600">
                Email settings are read-only while this campaign is archived.
              </p>
            ) : (
              <CampaignEmailSettingsForm
                campaignId={campaign.id}
                emailLength={campaign.emailLength}
                emailGuidance={campaign.emailGuidance}
              />
            )}
          </Panel>
        </>
      ) : null}

      {currentStage === "emails" ? (
        <Panel
          title={`Emails (${stageContacts.length} contacts)`}
          description="Generate, edit, and send drafts for every contact in this campaign. Use Compare drafts to review several at once."
        >
          {voiceSamples.length === 0 ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-950">
                Add a voice sample before generating your first email.
              </p>
              <Link
                href="/settings/voice"
                className="mt-2 inline-flex text-sm font-medium text-amber-950 underline"
              >
                Set up your voice
              </Link>
            </div>
          ) : null}
          {stageContacts.length > 0 ? (
            <EmailDraftsStage
              campaignEmailLength={campaign.emailLength}
              offerWarnings={[]}
              emailDeeplinkMaxUrlLength={
                usagePolicy.emailDeeplinkMaxUrlLength
              }
              mailboxConnection={
                mailboxConnection
                  ? {
                      status: mailboxConnection.status,
                      mailboxAddress: mailboxConnection.mailboxAddress,
                    }
                  : null
              }
              dailySendUsage={{
                used: dailySendUsage.used,
                warningLimit: dailySendUsage.warningLimit,
                limit: dailySendUsage.limit,
              }}
              readOnly={campaignArchived}
              contacts={stageContacts.map((campaignContact) => {
                const contact = campaignContact.contact;
                const draftScreen = draftScreens[campaignContact.id];
                return {
                  campaignContactId: campaignContact.id,
                  contactId: contact.id,
                  contactName: contactDisplayName(
                    contact.firstName,
                    contact.lastName,
                  ),
                  contactDetails:
                    [contact.title, contact.company]
                      .filter(Boolean)
                      .join(" · ") || "No role details",
                  contactEmail: contact.email,
                  contactStatus: campaignContact.status,
                  suppressed: contactMatchesSuppressionSet(
                    contact.email,
                    suppressedEmails,
                  ),
                  sequenceStopped: campaignContact.sequenceStoppedAt != null,
                  sequenceStoppedReason:
                    campaignContact.sequenceStoppedReason,
                  qualificationBucket:
                    bucketByContactId.get(contact.id) ?? null,
                  personaOptions: draftScreen?.personaOptions ?? [],
                  resolvedPersonaId: draftScreen?.resolvedPersonaId ?? null,
                  resolvedPersonaName:
                    draftScreen?.resolvedPersonaName ?? null,
                  hasPersonaDecision:
                    draftScreen?.hasPersonaDecision ?? true,
                  needsPersonaConfirmation:
                    draftScreen?.needsPersonaConfirmation ?? false,
                  suggestedPersonaId:
                    draftScreen?.suggestedPersonaId ?? null,
                  suggestedPersonaName:
                    draftScreen?.suggestedPersonaName ?? null,
                  personaDecisionReason:
                    draftScreen?.personaDecisionReason ?? null,
                  personalizationTier:
                    draftScreen?.personalizationTier ?? "THIN",
                  personalizationLabel:
                    draftScreen?.personalizationLabel ??
                    "Persona and product only",
                  personalizationDetail:
                    draftScreen?.personalizationDetail ??
                    "No usable company or contact research.",
                  personalizationSources:
                    draftScreen?.personalizationSources ??
                    "No company research available. No contact research available.",
                  drafts: campaignContact.emailDrafts
                    .filter(
                      (draft) =>
                        Boolean(draft.subject) && Boolean(draft.body),
                    )
                    .map((draft) => ({
                      id: draft.id,
                      sequenceNumber: draft.sequenceNumber,
                      subject: draft.subject ?? "",
                      body: draft.body ?? "",
                      status: draft.status,
                      source: draft.source,
                      generationQuotaCommitted: draft.generationQuotaCommitted,
                      kind: draft.kind,
                      sentAt: draft.sentAt?.toISOString() ?? null,
                      handoffAt:
                        draft.sendRecords[0]?.occurredAt.toISOString() ??
                        null,
                      replyClassification: draft.replyClassification,
                      referralSuggested: draft.referralSuggested,
                      emailLength: parseEmailLength(draft.emailLength),
                      personaId: draft.personaId,
                      personalizationTier: asPersonalizationTier(
                        draft.personalizationTier,
                      ),
                      personalizationSources:
                        draft.personalizationSources,
                      claimConflicts: claimConflictsFromJson(
                        draft.claimConflictsJson,
                      ),
                      staleReasons: emailDraftStaleness({
                        draftCreatedAt: draft.createdAt.toISOString(),
                        draftStatus: draft.status,
                        productUpdatedAt,
                        personaUpdatedAt:
                          (draft.personaId
                            ? personaUpdatedAtById.get(draft.personaId)
                            : null) ??
                          (draftScreen?.resolvedPersonaId
                            ? personaUpdatedAtById.get(
                                draftScreen.resolvedPersonaId,
                              )
                            : null) ??
                          null,
                        companyResearchUpdatedAt: contact.companyId
                          ? companyResearchUpdatedAtByCompanyId.get(
                              contact.companyId,
                            ) ?? null
                          : null,
                      }).reasons,
                    })),
                };
              })}
            />
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 p-6 text-center">
              <p className="text-sm text-slate-600">
                No contacts are attached to this campaign yet.
              </p>
              <Link
                href={`/campaigns/${campaign.id}?stage=list`}
                className="mt-3 inline-flex text-sm font-medium text-slate-900 underline"
              >
                Add contacts
              </Link>
            </div>
          )}
        </Panel>
      ) : null}

      {currentStage === "list" ? (
        <Panel
          title="5 List"
          description="Select an existing scored list or attach organization contacts."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href="/lists"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
            >
              Upload or manage lists
            </Link>
          </div>
          {campaignArchived ? (
            <p className="text-sm text-slate-600">
              Contacts cannot be changed while this campaign is archived.
            </p>
          ) : (
            <CampaignContactsManager
              campaignId={campaign.id}
              search={query.q?.trim() ?? ""}
              contacts={availableContacts.map((contact) => ({
                id: contact.id,
                name: contactDisplayName(contact.firstName, contact.lastName),
                email: contact.email,
                title: contact.title,
                company: contact.company,
                listName:
                  contact.contactLists.map((list) => list.name).join(", ") ||
                  "Unlisted",
              }))}
              scoringRuns={scoringRuns.map((run) => ({
                id: run.id,
                listName: run.contactList.name,
                status: run.status,
                completedScoreCount: run.completedScoreCount,
                createdLabel: formatDate(run.createdAt),
              }))}
            />
          )}
        </Panel>
      ) : null}

      {currentStage === "companies" ? (
        <Panel
          title="6 Companies"
          description={`Qualification against ${campaign.icp.name}, the campaign ICP only.`}
        >
          <QualificationBuckets
            campaignId={campaign.id}
            scoringRunId={qualification.scoringRunId}
            rows={campaignCompanyRows}
            emptyTitle="No company qualification results yet"
            emptyActionHref={`/campaigns/${campaign.id}?stage=list`}
            emptyActionLabel="Choose a list"
          />
        </Panel>
      ) : null}

      {currentStage === "contacts" ? (
        <Panel
          title="7 Contacts"
          description="Review all campaign contacts, including excluded rows with inline reasoning. Restore contacts individually or in bulk when the exclusion should not apply."
        >
          <QualificationBuckets
            campaignId={campaign.id}
            scoringRunId={qualification.scoringRunId}
            rows={campaignContactRows}
            emptyTitle="No contact qualification results yet"
            emptyActionHref={`/campaigns/${campaign.id}?stage=companies`}
            emptyActionLabel="Review companies"
          />
        </Panel>
      ) : null}

      {currentStage === "report" ? (
        <Panel
          title="9 Report"
          description="Activity recorded directly by this application."
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Companies added", companyCount],
              ["Companies qualified", qualifiedCompanyCount],
              ["Contacts qualified", qualifiedContactCount],
              ["Emails generated", generatedEmailCount],
              ["Emails sent", sentEmailCount],
              ["Sequence positions reached", sequencePositionsReached],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {generatedEmailCount === 0 && sentEmailCount === 0 ? (
            <div className="mt-5 rounded-md border border-dashed border-slate-300 p-5 text-center">
              <p className="text-sm text-slate-600">
                No campaign activity has been recorded yet.
              </p>
              <Link
                href={`/campaigns/${campaign.id}?stage=emails`}
                className="mt-2 inline-flex text-sm font-medium underline"
              >
                Go to Emails
              </Link>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
