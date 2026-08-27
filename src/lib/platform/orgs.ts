import "server-only";

import type {
  OrganizationAccountType,
  OrganizationStatus,
  UsageCategory,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { aggregateUsage } from "@/lib/usage/events";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  DEFAULT_RESEARCH_POLICY_VALUES,
  DEFAULT_USAGE_POLICY_VALUES,
} from "@/lib/usage/defaults";
import { FREE_BILLING_DEFAULTS } from "@/lib/billing/billing-state";
import { createOrganizationInvitationAsPlatform } from "@/lib/org/signup";

export type PlatformOrgListItem = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  accountType: "INDIVIDUAL" | "ENTERPRISE";
  createdAt: Date;
  memberCount: number;
  productCount: number;
  campaignCount: number;
  lastActiveAt: Date | null;
  researchedCompaniesUsed: number;
  researchedCompaniesLimit: number | null;
  suspendedAt: Date | null;
  planCode: string;
  billingStatus: string;
};

export type OrgHealthWindow = {
  research: { failed: number; total: number; failureRate: number };
  emailGeneration: { failed: number; total: number; failureRate: number };
};

export type OrgHealthSummary = {
  last7d: OrgHealthWindow;
  last30d: OrgHealthWindow;
};

const RESEARCH_CATEGORIES: UsageCategory[] = [
  "RESEARCH",
  "CONTACT_RESEARCH",
  "PRODUCT_RESEARCH",
  "PERSONA_RESEARCH",
];

function failureRate(failed: number, total: number): number {
  if (total <= 0) return 0;
  return failed / total;
}

async function healthForWindow(
  organizationId: string,
  since: Date,
): Promise<OrgHealthWindow> {
  const events = await prisma.usageEvent.groupBy({
    by: ["category", "status"],
    where: {
      organizationId,
      occurredAt: { gte: since },
      OR: [
        { category: { in: RESEARCH_CATEGORIES } },
        { category: "EMAIL_GENERATION" },
      ],
    },
    _count: { _all: true },
  });

  let researchFailed = 0;
  let researchTotal = 0;
  let emailFailed = 0;
  let emailTotal = 0;

  for (const row of events) {
    const n = row._count._all;
    const isResearch = RESEARCH_CATEGORIES.includes(row.category);
    const isEmail = row.category === "EMAIL_GENERATION";
    if (isResearch) {
      researchTotal += n;
      if (row.status === "FAILED") researchFailed += n;
    }
    if (isEmail) {
      emailTotal += n;
      if (row.status === "FAILED") emailFailed += n;
    }
  }

  return {
    research: {
      failed: researchFailed,
      total: researchTotal,
      failureRate: failureRate(researchFailed, researchTotal),
    },
    emailGeneration: {
      failed: emailFailed,
      total: emailTotal,
      failureRate: failureRate(emailFailed, emailTotal),
    },
  };
}

export async function orgHealthSummary(
  organizationId: string,
  now: Date = new Date(),
): Promise<OrgHealthSummary> {
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [last7d, last30d] = await Promise.all([
    healthForWindow(organizationId, last7),
    healthForWindow(organizationId, last30),
  ]);
  return { last7d, last30d };
}

export async function listOrganizationsForPlatform(input?: {
  actorUserId?: string;
}): Promise<PlatformOrgListItem[]> {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      accountType: true,
      createdAt: true,
      suspendedAt: true,
      usagePolicy: {
        select: { activeResearchedCompanyLimit: true },
      },
      billingProfile: {
        select: { planCode: true, billingStatus: true },
      },
      _count: {
        select: {
          memberships: true,
          products: true,
          campaigns: true,
        },
      },
    },
  });

  if (input?.actorUserId) {
    await recordAdminAuditEvent({
      action: "PLATFORM_ORG_LISTED",
      actorUserId: input.actorUserId,
      metadata: { count: orgs.length },
    });
  }

  const items: PlatformOrgListItem[] = [];
  for (const org of orgs) {
    const [lastUsage, lastUserActivity, researchedCompaniesUsed] =
      await Promise.all([
        prisma.usageEvent.findFirst({
          where: { organizationId: org.id },
          orderBy: { occurredAt: "desc" },
          select: { occurredAt: true },
        }),
        prisma.user.findFirst({
          where: { activeOrganizationId: org.id },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        countActiveResearchedCompanies(org.id),
      ]);

    const lastActiveCandidates = [
      lastUsage?.occurredAt,
      lastUserActivity?.updatedAt,
    ].filter((d): d is Date => Boolean(d));
    const lastActiveAt =
      lastActiveCandidates.length > 0
        ? new Date(Math.max(...lastActiveCandidates.map((d) => d.getTime())))
        : null;

    items.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      accountType: org.accountType,
      createdAt: org.createdAt,
      memberCount: org._count.memberships,
      productCount: org._count.products,
      campaignCount: org._count.campaigns,
      lastActiveAt,
      researchedCompaniesUsed,
      researchedCompaniesLimit:
        org.usagePolicy?.activeResearchedCompanyLimit ?? null,
      suspendedAt: org.suspendedAt,
      planCode: org.billingProfile?.planCode ?? "FREE",
      billingStatus: org.billingProfile?.billingStatus ?? "FREE",
    });
  }

  return items;
}

export async function getOrganizationPlatformDetail(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      billingProfile: {
        select: {
          billingEmail: true,
          planCode: true,
          billingStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          currentPeriodEnd: true,
        },
      },
      usagePolicy: true,
      invitations: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              emailVerifiedAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      products: {
        where: { archivedAt: null },
        select: { id: true, name: true, approvalStatus: true, createdAt: true },
        orderBy: { name: "asc" },
      },
      icps: {
        where: { archivedAt: null },
        select: { id: true, name: true, productId: true, createdAt: true },
        orderBy: { name: "asc" },
      },
      personas: {
        where: { archivedAt: null },
        select: { id: true, name: true, productId: true, createdAt: true },
        orderBy: { name: "asc" },
      },
      campaigns: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      contactLists: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          totalContacts: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      },
      creditGrants: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          grantedBy: {
            select: { id: true, email: true, name: true },
          },
        },
      },
    },
  });

  if (!org) return null;

  const [usageToday, usage7d, usage30d, researchedCompaniesUsed, health] =
    await Promise.all([
      aggregateUsage({
        organizationId: org.id,
        timezone: org.timezone,
        window: "today",
      }),
      aggregateUsage({
        organizationId: org.id,
        timezone: org.timezone,
        window: "7d",
      }),
      aggregateUsage({
        organizationId: org.id,
        timezone: org.timezone,
        window: "30d",
      }),
      countActiveResearchedCompanies(org.id),
      orgHealthSummary(org.id),
    ]);

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      accountType: org.accountType,
      timezone: org.timezone,
      createdAt: org.createdAt,
      suspendedAt: org.suspendedAt,
      suspendedReason: org.suspendedReason,
      suspendedByUserId: org.suspendedByUserId,
    },
    billing: {
      billingEmail: org.billingProfile?.billingEmail ?? null,
      planCode: org.billingProfile?.planCode ?? "FREE",
      billingStatus: org.billingProfile?.billingStatus ?? "FREE",
      stripeCustomerId: org.billingProfile?.stripeCustomerId ?? null,
      stripeSubscriptionId: org.billingProfile?.stripeSubscriptionId ?? null,
      currentPeriodEnd: org.billingProfile?.currentPeriodEnd ?? null,
    },
    billingEmail: org.billingProfile?.billingEmail ?? null,
    usagePolicy: org.usagePolicy,
    members: org.memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      isBillingContact: m.isBillingContact,
      user: m.user,
    })),
    pendingInvitations: org.invitations,
    products: org.products,
    icps: org.icps,
    personas: org.personas,
    campaigns: org.campaigns,
    contactLists: org.contactLists,
    creditGrants: org.creditGrants,
    usage: {
      today: usageToday,
      last7d: usage7d,
      last30d: usage30d,
      researchedCompaniesUsed,
      researchedCompaniesLimit:
        org.usagePolicy?.activeResearchedCompanyLimit ?? null,
    },
    health,
  };
}

/** Scoped read-only customer view payload (names/status only). */
export async function getOrganizationScopedView(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      status: true,
      products: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      icps: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      personas: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      campaigns: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          contacts: {
            select: {
              emailDrafts: {
                where: { subject: { not: null } },
                select: { subject: true, status: true },
                take: 3,
                orderBy: { updatedAt: "desc" },
              },
            },
            take: 8,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 40,
      },
    },
  });
  if (!org) return null;

  return {
    id: org.id,
    name: org.name,
    status: org.status,
    products: org.products,
    icps: org.icps,
    personas: org.personas,
    campaigns: org.campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      subjects: c.contacts
        .flatMap((cc) => cc.emailDrafts)
        .filter((d) => d.subject)
        .slice(0, 5)
        .map((d) => ({ subject: d.subject!, status: d.status })),
    })),
  };
}

export async function recordPlatformOrgView(input: {
  actorUserId: string;
  organizationId: string;
  surface: "detail" | "scoped_view";
}): Promise<void> {
  await recordAdminAuditEvent({
    action: "PLATFORM_ORG_VIEWED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: { surface: input.surface },
  });
}

export async function suspendOrganization(input: {
  organizationId: string;
  actorUserId: string;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Suspension reason is required.");
  }

  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      status: "SUSPENDED",
      suspendedAt: new Date(),
      suspendedReason: reason,
      suspendedByUserId: input.actorUserId,
    },
  });

  await recordAdminAuditEvent({
    action: "ORGANIZATION_SUSPENDED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: { reason },
  });
}

export async function unsuspendOrganization(input: {
  organizationId: string;
  actorUserId: string;
}): Promise<void> {
  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      status: "ACTIVE",
      suspendedAt: null,
      suspendedReason: null,
      suspendedByUserId: null,
    },
  });

  await recordAdminAuditEvent({
    action: "ORGANIZATION_UNSUSPENDED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
  });
}

export async function updateOrganizationUsagePolicyAsPlatform(input: {
  organizationId: string;
  actorUserId: string;
  activeResearchedCompanyLimit: number;
  dailyEmailGenerationLimit: number;
  dailyEmailSendWarningLimit: number;
}): Promise<void> {
  const {
    activeResearchedCompanyLimit,
    dailyEmailGenerationLimit,
    dailyEmailSendWarningLimit,
  } = input;

  if (
    ![
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
    ].every((n) => Number.isInteger(n) && n >= 0)
  ) {
    throw new Error("Usage policy values must be non-negative integers.");
  }

  await prisma.organizationUsagePolicy.upsert({
    where: { organizationId: input.organizationId },
    update: {
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
      dailyEmailSendLimit: dailyEmailSendWarningLimit,
    },
    create: {
      organizationId: input.organizationId,
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
      dailyEmailSendLimit: dailyEmailSendWarningLimit,
    },
  });

  await recordAdminAuditEvent({
    action: "PLATFORM_USAGE_POLICY_CHANGED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
    },
  });
}

export async function grantOrganizationCredit(input: {
  organizationId: string;
  actorUserId: string;
  amountUsd: number;
  reason: string;
  note?: string | null;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Credit grant reason is required.");
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("Credit amount must be a positive number.");
  }

  await prisma.organizationCreditGrant.create({
    data: {
      organizationId: input.organizationId,
      grantedByUserId: input.actorUserId,
      amountUsd: input.amountUsd,
      reason,
      note: input.note?.trim() || null,
    },
  });

  await recordAdminAuditEvent({
    action: "ORGANIZATION_CREDIT_GRANTED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      amountUsd: input.amountUsd,
      reason,
    },
  });
}

function slugifyOrgName(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

async function uniqueOrganizationSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  return `${candidate}-${stamp}`.slice(0, 60);
}

/**
 * SUPER_ADMIN creates an org (INDIVIDUAL or ENTERPRISE) and invites the first
 * user as OWNER via the existing invitation email/accept flow.
 */
export async function createPlatformOrganization(input: {
  actorUserId: string;
  name: string;
  accountType: OrganizationAccountType;
  ownerEmail: string;
  timezone?: string;
}): Promise<{
  organizationId: string;
  invitationId: string;
  accountType: OrganizationAccountType;
}> {
  const name = input.name.trim();
  if (!name) throw new Error("Organization name is required.");
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!ownerEmail.includes("@")) {
    throw new Error("Owner email is required.");
  }
  if (
    input.accountType !== "INDIVIDUAL" &&
    input.accountType !== "ENTERPRISE"
  ) {
    throw new Error("Account type must be INDIVIDUAL or ENTERPRISE.");
  }

  const slug = await uniqueOrganizationSlug(slugifyOrgName(name));
  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name,
        slug,
        status: "ACTIVE",
        accountType: input.accountType,
        timezone: input.timezone?.trim() || DEFAULT_ORGANIZATION_TIMEZONE,
      },
    });
    await tx.organizationUsagePolicy.create({
      data: {
        organizationId: org.id,
        ...DEFAULT_USAGE_POLICY_VALUES,
      },
    });
    await tx.researchPolicy.create({
      data: {
        organizationId: org.id,
        ...DEFAULT_RESEARCH_POLICY_VALUES,
      },
    });
    await tx.organizationBillingProfile.create({
      data: {
        organizationId: org.id,
        billingEmail: ownerEmail,
        ...FREE_BILLING_DEFAULTS,
      },
    });
    return org;
  });

  await recordAdminAuditEvent({
    action: "PLATFORM_ORGANIZATION_CREATED",
    actorUserId: input.actorUserId,
    organizationId: organization.id,
    metadata: {
      accountType: input.accountType,
      ownerEmail,
      planCode: FREE_BILLING_DEFAULTS.planCode,
      billingStatus: FREE_BILLING_DEFAULTS.billingStatus,
    },
  });

  const invitation = await createOrganizationInvitationAsPlatform({
    organizationId: organization.id,
    invitedByUserId: input.actorUserId,
    email: ownerEmail,
    role: "OWNER",
  });

  return {
    organizationId: organization.id,
    invitationId: invitation.invitationId,
    accountType: input.accountType,
  };
}
