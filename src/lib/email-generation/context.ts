import "server-only";

import type {
  EmailDraftKind,
  EmailDraftStatus,
  EmailLength,
  ReplyClassification,
} from "@prisma/client";
import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import { prisma } from "@/lib/prisma";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { TenantError } from "@/lib/tenant/errors";
import { evidenceFragments } from "@/lib/campaign/offer-validation";
import {
  isResearchFresh,
  parseStringArray,
} from "@/lib/research/freshness";
import {
  resolveEmailGenerationPersona,
  resolvePersonalization,
  contactResearchForPrompt,
  type PersonalizationTier,
} from "@/lib/email-generation/personalization";

const CONTACT_RESEARCH_FRESHNESS_DAYS = 90;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function lines(value: string | null): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function isFreshContactResearch(
  research: {
    researchedAt: Date | null;
    roleSummary: string | null;
    confidence: "HIGH" | "MEDIUM" | "LOW" | null;
    status: "COMPLETED" | "PARTIAL" | string;
  } | null,
  now = new Date(),
): boolean {
  if (!research?.researchedAt || !research.roleSummary?.trim()) return false;
  if (research.confidence !== "HIGH" && research.confidence !== "MEDIUM") {
    return false;
  }
  if (research.status !== "COMPLETED" && research.status !== "PARTIAL") {
    return false;
  }
  const ageMs = now.getTime() - research.researchedAt.getTime();
  return (
    ageMs <= CONTACT_RESEARCH_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
  );
}

export type EmailGenerationContext = {
  organizationId: string;
  userId: string;
  campaignContact: {
    id: string;
    campaignId: string;
    contactId: string;
  };
  campaign: {
    id: string;
    name: string;
    offerName: string | null;
    offerDescription: string | null;
    offerCta: string | null;
    offerNotes: string | null;
    offerValidationJson: unknown;
    offerValidationHash: string | null;
    emailLength: EmailLength;
    emailGuidance: string | null;
  };
  /** Length used for this generation. Campaign setting unless a per-draft override is supplied. */
  emailLength: EmailLength;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    industry: string | null;
    location: string | null;
  };
  product: {
    id: string;
    name: string;
    description: string | null;
    valueProposition: string | null;
    evidence: string[];
    problemsSolved: string[];
    messaging: {
      primaryPositioning: string[];
      coreValueThemes: string[];
      strongestDifferentiators: string[];
      proofPoints: string[];
      supportedClaims: string[];
      claimsNotToMake: string[];
      terminologyToUse: string[];
      terminologyToAvoid: string[];
    };
  };
  persona: {
    id: string;
    name: string;
    painPoints: string[];
    desiredOutcomes: string[];
    messagingNotes: string[];
    messaging: {
      positioning: string[];
      proofPoints: string[];
      objections: string[];
    };
    profile: {
      terminology: string[];
      organizationalPressures: string[];
      buyingRole: string[];
      decisionInfluence: string[];
    };
  };
  icp: {
    id: string;
    name: string;
    definition: string | null;
    description: string | null;
  };
  contactResearch: {
    id: string;
    currentTitle: string | null;
    roleSummary: string | null;
    responsibilities: string[];
    ownershipAreas: string[];
    professionalSignals: string[];
    negativeRoleSignals: string[];
    confidence: "HIGH" | "MEDIUM" | "LOW" | null;
    researchedAt: Date;
  } | null;
  companyResearch: EmailCompanyResearch | null;
  voiceSamples: Array<{
    id: string;
    label: string;
    sampleText: string;
    createdAt: Date;
  }>;
  sequence: Array<{
    id: string;
    sequenceNumber: number;
    kind: EmailDraftKind;
    subject: string | null;
    body: string | null;
    status: EmailDraftStatus;
    sentAt: Date | null;
    replyClassification: ReplyClassification | null;
    prospectReplyText: string | null;
    referralSuggested: boolean;
    inReplyToDraftId: string | null;
  }>;
  personaResolution: {
    source: "override" | "stored" | "matched" | "campaign_fallback" | "in_play";
    usedCampaignFallback: boolean;
  };
};

export type EmailDraftScreenState = {
  resolvedPersonaId: string | null;
  resolvedPersonaName: string | null;
  usedCampaignFallback: boolean;
  personaOptions: Array<{ id: string; name: string }>;
  personalizationTier: PersonalizationTier;
  personalizationLabel: string;
  personalizationDetail: string;
  personalizationSources: string;
};

export async function loadEmailGenerationContext(
  campaignContactId: string,
  userId: string,
  options?: {
    personaId?: string | null;
    storedPersonaId?: string | null;
    emailLength?: EmailLength | null;
  },
): Promise<EmailGenerationContext> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TenantError("User not found.");

  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;

  const campaignContact = await prisma.campaignContact.findFirst({
    where: { id: campaignContactId, organizationId },
    include: {
      contact: true,
      emailDrafts: {
        orderBy: { sequenceNumber: "asc" },
        select: {
          id: true,
          sequenceNumber: true,
          kind: true,
          subject: true,
          body: true,
          status: true,
          sentAt: true,
          replyClassification: true,
          prospectReplyText: true,
          referralSuggested: true,
          inReplyToDraftId: true,
          emailLength: true,
          personaId: true,
          personalizationTier: true,
          personalizationSources: true,
        },
      },
      campaign: {
        include: {
          product: true,
          persona: true,
          icp: true,
          personasInPlay: {
            include: { persona: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!campaignContact) {
    throw new TenantError(
      "Campaign contact was not found in the active organization.",
    );
  }

  const { campaign, contact } = campaignContact;
  if (
    campaign.organizationId !== organizationId ||
    contact.organizationId !== organizationId ||
    campaign.product.organizationId !== organizationId ||
    (campaign.persona &&
      campaign.persona.organizationId !== organizationId) ||
    campaign.icp.organizationId !== organizationId
  ) {
    throw new TenantError(
      "Campaign contact relationships do not belong to the active organization.",
    );
  }

  const [
    voiceSamples,
    contactResearch,
    approvedEvidence,
    companyResearchRow,
    matchedScore,
  ] = await Promise.all([
      prisma.voiceSample.findMany({
        where: { organizationId, userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          label: true,
          sampleText: true,
          createdAt: true,
        },
      }),
      prisma.contactResearch.findUnique({
        where: {
          organizationId_contactId: {
            organizationId,
            contactId: contact.id,
          },
        },
      }),
      campaign.product.approvedEvidenceBundleId
        ? prisma.productEvidenceBundle.findFirst({
            where: {
              id: campaign.product.approvedEvidenceBundleId,
              organizationId,
              productId: campaign.product.id,
            },
            select: { normalizedEvidenceJson: true },
          })
        : Promise.resolve(null),
      contact.companyId
        ? prisma.companyResearch.findFirst({
            where: { organizationId, companyId: contact.companyId },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve(null),
      prisma.contactScore.findFirst({
        where: {
          organizationId,
          contactId: contact.id,
          scoringStatus: "COMPLETED",
          scoringRun: {
            organizationId,
            productId: campaign.productId,
            icpId: campaign.icpId,
            status: { in: ["COMPLETED", "PARTIAL"] },
          },
        },
        orderBy: [{ scoredAt: "desc" }, { createdAt: "desc" }],
        select: { matchedPersonaId: true },
      }),
    ]);
  const freshContactResearch = isFreshContactResearch(contactResearch)
    ? contactResearch
    : null;
  const freshCompanyResearch =
    companyResearchRow && isResearchFresh(companyResearchRow)
      ? companyResearchRow
      : null;

  const inPlayPersonaIds = campaign.personasInPlay.map((row) => row.personaId);
  const resolved = resolveEmailGenerationPersona({
    overridePersonaId: options?.personaId,
    storedPersonaId: options?.storedPersonaId,
    matchedPersonaId: matchedScore?.matchedPersonaId ?? null,
    campaignFallbackPersonaId: campaign.personaId,
    inPlayPersonaIds,
  });
  const personaRow =
    resolved.personaId === campaign.persona?.id
      ? campaign.persona
      : resolved.personaId
        ? await prisma.persona.findFirst({
            where: {
              id: resolved.personaId,
              organizationId,
              productId: campaign.productId,
            },
          })
        : null;
  if (!personaRow) {
    throw new TenantError(
      "No persona is available for this contact. Score the contact so a persona can be matched, pick a persona for this email, or set personas in play on the campaign.",
    );
  }
  const emailLength = options?.emailLength ?? campaign.emailLength;

  const productMessaging = objectValue(campaign.product.messagingJson);
  const productProfile = objectValue(campaign.product.profileJson);
  const personaMessaging = objectValue(personaRow.personaMessagingJson);
  const personaProfile = objectValue(personaRow.profileJson);

  return {
    organizationId,
    userId,
    campaignContact: {
      id: campaignContact.id,
      campaignId: campaign.id,
      contactId: contact.id,
    },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      offerName: campaign.offerName,
      offerDescription: campaign.offerDescription,
      offerCta: campaign.offerCta,
      offerNotes: campaign.offerNotes,
      offerValidationJson: campaign.offerValidationJson,
      offerValidationHash: campaign.offerValidationHash,
      emailLength: campaign.emailLength,
      emailGuidance: campaign.emailGuidance,
    },
    emailLength,
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      title: contact.title,
      company: contact.company,
      industry: contact.industry,
      location: contact.location,
    },
    product: {
      id: campaign.product.id,
      name: campaign.product.name,
      description: campaign.product.description,
      valueProposition: campaign.product.valueProposition,
      evidence: [
        campaign.product.description,
        campaign.product.valueProposition,
        ...stringList(productMessaging.proofPoints),
        ...stringList(productMessaging.supportedClaims),
        ...evidenceFragments(campaign.product.profileJson, "productProfile"),
        ...evidenceFragments(
          approvedEvidence?.normalizedEvidenceJson,
          "approvedProductEvidence",
        ),
      ].filter((value): value is string => Boolean(value?.trim())),
      problemsSolved: stringList(productProfile.problemsSolved),
      messaging: {
        primaryPositioning: stringList(
          productMessaging.primaryPositioning,
        ),
        coreValueThemes: stringList(productMessaging.coreValueThemes),
        strongestDifferentiators: stringList(
          productMessaging.strongestDifferentiators,
        ),
        proofPoints: stringList(productMessaging.proofPoints),
        supportedClaims: stringList(productMessaging.supportedClaims),
        claimsNotToMake: stringList(productMessaging.claimsNotToMake),
        terminologyToUse: stringList(productMessaging.terminologyToUse),
        terminologyToAvoid: stringList(productMessaging.terminologyToAvoid),
      },
    },
    persona: {
      id: personaRow.id,
      name: personaRow.name,
      painPoints: lines(personaRow.painPoints),
      desiredOutcomes: lines(personaRow.desiredOutcomes),
      messagingNotes: lines(personaRow.messagingNotes),
      messaging: {
        positioning: stringList(personaMessaging.positioning),
        proofPoints: stringList(personaMessaging.proofPoints),
        objections: stringList(personaMessaging.objections),
      },
      profile: {
        terminology: stringList(personaProfile.terminology),
        organizationalPressures: stringList(
          personaProfile.organizationalPressures,
        ),
        buyingRole: stringList(personaProfile.buyingRole),
        decisionInfluence: stringList(personaProfile.decisionInfluence),
      },
    },
    icp: {
      id: campaign.icp.id,
      name: campaign.icp.name,
      definition: campaign.icp.definition,
      description: campaign.icp.description,
    },
    contactResearch: freshContactResearch?.researchedAt
      ? {
          id: freshContactResearch.id,
          currentTitle: freshContactResearch.currentTitle,
          roleSummary: freshContactResearch.roleSummary,
          responsibilities: stringList(freshContactResearch.responsibilities),
          ownershipAreas: stringList(freshContactResearch.ownershipAreas),
          professionalSignals: stringList(
            freshContactResearch.professionalSignals,
          ),
          negativeRoleSignals: stringList(
            freshContactResearch.negativeRoleSignals,
          ),
          confidence: freshContactResearch.confidence,
          researchedAt: freshContactResearch.researchedAt,
        }
      : null,
    companyResearch: freshCompanyResearch
      ? {
          companySummary: freshCompanyResearch.companySummary,
          whatTheySell: freshCompanyResearch.whatTheySell,
          customerTypes: parseStringArray(freshCompanyResearch.customerTypes),
          primaryMarkets: parseStringArray(freshCompanyResearch.primaryMarkets),
          businessModel: freshCompanyResearch.businessModel,
          companySizeContext: freshCompanyResearch.companySizeContext,
          confidence: freshCompanyResearch.researchConfidence,
        }
      : null,
    voiceSamples,
    sequence: campaignContact.emailDrafts,
    personaResolution: {
      source: resolved.source,
      usedCampaignFallback: resolved.usedCampaignFallback,
    },
  };
}

export async function loadEmailDraftScreenStates(input: {
  organizationId: string;
  productId: string;
  icpId: string;
  campaignPersonaId: string | null;
  campaignPersonaName: string | null;
  inPlay: Array<{ personaId: string; name: string }>;
  productPersonas: Array<{ id: string; name: string }>;
  contacts: Array<{
    campaignContactId: string;
    contactId: string;
    companyId: string | null;
    storedPersonaId?: string | null;
  }>;
}): Promise<Record<string, EmailDraftScreenState>> {
  const contactIds = input.contacts.map((row) => row.contactId);
  const companyIds = Array.from(
    new Set(
      input.contacts
        .map((row) => row.companyId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const personaOptions =
    input.inPlay.length > 0
      ? input.inPlay.map((row) => ({ id: row.personaId, name: row.name }))
      : input.productPersonas;
  const personaNameById = new Map(
    [
      ...input.productPersonas.map((persona) => [persona.id, persona.name] as const),
      ...(input.campaignPersonaId && input.campaignPersonaName
        ? ([[input.campaignPersonaId, input.campaignPersonaName]] as const)
        : []),
    ],
  );

  const [scores, contactResearchRows, companyResearchRows] = await Promise.all([
    contactIds.length > 0
      ? prisma.contactScore.findMany({
          where: {
            organizationId: input.organizationId,
            contactId: { in: contactIds },
            scoringStatus: "COMPLETED",
            scoringRun: {
              organizationId: input.organizationId,
              productId: input.productId,
              icpId: input.icpId,
              status: { in: ["COMPLETED", "PARTIAL"] },
            },
          },
          orderBy: [{ scoredAt: "desc" }, { createdAt: "desc" }],
          select: { contactId: true, matchedPersonaId: true, scoredAt: true },
        })
      : Promise.resolve([]),
    contactIds.length > 0
      ? prisma.contactResearch.findMany({
          where: {
            organizationId: input.organizationId,
            contactId: { in: contactIds },
          },
        })
      : Promise.resolve([]),
    companyIds.length > 0
      ? prisma.companyResearch.findMany({
          where: {
            organizationId: input.organizationId,
            companyId: { in: companyIds },
          },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const matchedByContact = new Map<string, string | null>();
  for (const score of scores) {
    if (!matchedByContact.has(score.contactId)) {
      matchedByContact.set(score.contactId, score.matchedPersonaId);
    }
  }
  const contactResearchByContact = new Map(
    contactResearchRows.map((row) => [row.contactId, row]),
  );
  const companyResearchByCompany = new Map<string, (typeof companyResearchRows)[number]>();
  for (const row of companyResearchRows) {
    if (!companyResearchByCompany.has(row.companyId)) {
      companyResearchByCompany.set(row.companyId, row);
    }
  }

  const states: Record<string, EmailDraftScreenState> = {};
  for (const row of input.contacts) {
    const resolved = resolveEmailGenerationPersona({
      storedPersonaId: row.storedPersonaId ?? null,
      matchedPersonaId: matchedByContact.get(row.contactId) ?? null,
      campaignFallbackPersonaId: input.campaignPersonaId,
      inPlayPersonaIds: input.inPlay.map((persona) => persona.personaId),
    });
    const contactResearch = contactResearchByContact.get(row.contactId) ?? null;
    const companyResearchRow = row.companyId
      ? companyResearchByCompany.get(row.companyId) ?? null
      : null;
    const freshContact = isFreshContactResearch(contactResearch);
    const freshCompany =
      companyResearchRow && isResearchFresh(companyResearchRow)
        ? companyResearchRow
        : null;
    const personalization = resolvePersonalization({
      companyResearch: freshCompany
        ? {
            companySummary: freshCompany.companySummary,
            whatTheySell: freshCompany.whatTheySell,
            customerTypes: parseStringArray(freshCompany.customerTypes),
            primaryMarkets: parseStringArray(freshCompany.primaryMarkets),
            businessModel: freshCompany.businessModel,
            companySizeContext: freshCompany.companySizeContext,
            confidence: freshCompany.researchConfidence,
          }
        : null,
      contactResearch: contactResearchForPrompt(
        freshContact && contactResearch
          ? {
              roleSummary: contactResearch.roleSummary,
              responsibilities: stringList(contactResearch.responsibilities),
              ownershipAreas: stringList(contactResearch.ownershipAreas),
            }
          : null,
      ),
    });
    const options =
      resolved.personaId &&
      personaNameById.get(resolved.personaId) &&
      !personaOptions.some((persona) => persona.id === resolved.personaId)
        ? [
            {
              id: resolved.personaId,
              name: personaNameById.get(resolved.personaId)!,
            },
            ...personaOptions,
          ]
        : personaOptions;
    states[row.campaignContactId] = {
      resolvedPersonaId: resolved.personaId,
      resolvedPersonaName: resolved.personaId
        ? (personaNameById.get(resolved.personaId) ?? null)
        : null,
      usedCampaignFallback: resolved.usedCampaignFallback,
      personaOptions: options,
      personalizationTier: personalization.tier,
      personalizationLabel: personalization.label,
      personalizationDetail: personalization.detail,
      personalizationSources: personalization.sources,
    };
  }
  return states;
}

export async function loadEmailReplyContext(
  emailDraftId: string,
  userId: string,
): Promise<{
  context: EmailGenerationContext;
  sourceDraft: {
    id: string;
    campaignContactId: string;
    sequenceNumber: number;
    subject: string;
    body: string;
    status: EmailDraftStatus;
    sentAt: Date;
  };
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const draft = await prisma.emailDraft.findFirst({
    where: {
      id: emailDraftId,
      organizationId: membership.organization.id,
    },
    select: {
      id: true,
      campaignContactId: true,
      sequenceNumber: true,
      subject: true,
      body: true,
      status: true,
      sentAt: true,
    },
  });
  if (
    !draft ||
    !draft.subject ||
    !draft.body ||
    draft.status !== "SENT" ||
    !draft.sentAt
  ) {
    throw new TenantError("Replies can only be drafted from a sent email.");
  }
  return {
    context: await loadEmailGenerationContext(
      draft.campaignContactId,
      userId,
    ),
    sourceDraft: {
      ...draft,
      subject: draft.subject,
      body: draft.body,
      sentAt: draft.sentAt,
    },
  };
}

export async function loadExistingEmailDraftContext(
  emailDraftId: string,
  userId: string,
  options?: {
    personaId?: string | null;
    emailLength?: EmailLength | null;
  },
): Promise<{
  context: EmailGenerationContext;
  draft: EmailGenerationContext["sequence"][number];
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const row = await prisma.emailDraft.findFirst({
    where: {
      id: emailDraftId,
      organizationId: membership.organization.id,
    },
    select: {
      campaignContactId: true,
      personaId: true,
      emailLength: true,
    },
  });
  if (!row) {
    throw new TenantError(
      "Email draft does not belong to the active organization.",
    );
  }
  const context = await loadEmailGenerationContext(
    row.campaignContactId,
    userId,
    {
      personaId: options?.personaId,
      storedPersonaId: row.personaId,
      emailLength: options?.emailLength ?? row.emailLength,
    },
  );
  const draft = context.sequence.find((entry) => entry.id === emailDraftId);
  if (!draft) throw new TenantError("Email draft was not found.");
  return { context, draft };
}
