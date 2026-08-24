import "server-only";

import type { EmailLength } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { TenantError } from "@/lib/tenant/errors";

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
    emailLength: EmailLength;
    emailGuidance: string | null;
  };
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
  voiceSamples: Array<{
    id: string;
    label: string;
    sampleText: string;
    createdAt: Date;
  }>;
};

export async function loadEmailGenerationContext(
  campaignContactId: string,
  userId: string,
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
      campaign: {
        include: {
          product: true,
          persona: true,
          icp: true,
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
    campaign.persona.organizationId !== organizationId ||
    campaign.icp.organizationId !== organizationId
  ) {
    throw new TenantError(
      "Campaign contact relationships do not belong to the active organization.",
    );
  }

  const [voiceSamples, contactResearch] = await Promise.all([
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
  ]);
  const freshContactResearch = isFreshContactResearch(contactResearch)
    ? contactResearch
    : null;

  const productMessaging = objectValue(campaign.product.messagingJson);
  const personaMessaging = objectValue(campaign.persona.personaMessagingJson);
  const personaProfile = objectValue(campaign.persona.profileJson);

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
      emailLength: campaign.emailLength,
      emailGuidance: campaign.emailGuidance,
    },
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
      id: campaign.persona.id,
      name: campaign.persona.name,
      painPoints: lines(campaign.persona.painPoints),
      desiredOutcomes: lines(campaign.persona.desiredOutcomes),
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
    voiceSamples,
  };
}
