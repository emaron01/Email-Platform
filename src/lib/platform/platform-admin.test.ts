/**
 * Phase A platform admin console seam tests.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canMutatePlatform,
  isPlatformOperator,
  canEditTransactionalTemplates,
} from "@/lib/auth/authz";

describe("platform role gates", () => {
  it("SUPPORT is operator but cannot mutate or edit templates", () => {
    expect(isPlatformOperator("SUPPORT")).toBe(true);
    expect(canMutatePlatform("SUPPORT")).toBe(false);
    expect(canEditTransactionalTemplates("SUPPORT")).toBe(false);
  });

  it("SUPER_ADMIN can mutate platform and edit templates", () => {
    expect(isPlatformOperator("SUPER_ADMIN")).toBe(true);
    expect(canMutatePlatform("SUPER_ADMIN")).toBe(true);
    expect(canEditTransactionalTemplates("SUPER_ADMIN")).toBe(true);
  });

  it("NONE is not a platform operator", () => {
    expect(isPlatformOperator("NONE")).toBe(false);
    expect(canMutatePlatform("NONE")).toBe(false);
  });
});

describe("platform-orgs actions gate mutations to SUPER_ADMIN", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("SUPPORT cannot suspend; SUPER_ADMIN can", async () => {
    const suspendOrganization = vi.fn(async () => undefined);

    vi.doMock("@/lib/auth/authz", async () => {
      const actual = await vi.importActual<typeof import("@/lib/auth/authz")>(
        "@/lib/auth/authz",
      );
      return {
        ...actual,
        requirePlatformSuperAdmin: async () => {
          throw new actual.AuthorizationError(
            "Platform super admin required.",
          );
        },
      };
    });
    vi.doMock("@/lib/platform/orgs", () => ({
      suspendOrganization,
      unsuspendOrganization: vi.fn(),
      updateOrganizationUsagePolicyAsPlatform: vi.fn(),
      grantOrganizationCredit: vi.fn(),
      createPlatformOrganization: vi.fn(),
    }));
    vi.doMock("@/lib/org/signup", () => ({
      changeOrganizationMemberRole: vi.fn(),
      createOrganizationInvitationAsPlatform: vi.fn(),
      removeOrganizationMember: vi.fn(),
      revokeOrganizationInvitationAsPlatform: vi.fn(),
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));

    const { suspendOrganizationAction } = await import(
      "@/app/actions/platform-orgs"
    );
    const fd = new FormData();
    fd.set("organizationId", "org_1");
    fd.set("reason", "abuse");
    const result = await suspendOrganizationAction(null, fd);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Platform super admin required");
    expect(suspendOrganization).not.toHaveBeenCalled();

    vi.resetModules();
    const suspendOrganization2 = vi.fn(async () => undefined);
    vi.doMock("@/lib/auth/authz", async () => {
      const actual = await vi.importActual<typeof import("@/lib/auth/authz")>(
        "@/lib/auth/authz",
      );
      return {
        ...actual,
        requirePlatformSuperAdmin: async () => ({
          id: "sa_1",
          platformRole: "SUPER_ADMIN",
        }),
      };
    });
    vi.doMock("@/lib/platform/orgs", () => ({
      suspendOrganization: suspendOrganization2,
      unsuspendOrganization: vi.fn(),
      updateOrganizationUsagePolicyAsPlatform: vi.fn(),
      grantOrganizationCredit: vi.fn(),
      createPlatformOrganization: vi.fn(),
    }));
    vi.doMock("@/lib/org/signup", () => ({
      changeOrganizationMemberRole: vi.fn(),
      createOrganizationInvitationAsPlatform: vi.fn(),
      removeOrganizationMember: vi.fn(),
      revokeOrganizationInvitationAsPlatform: vi.fn(),
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));

    const { suspendOrganizationAction: suspendOk } = await import(
      "@/app/actions/platform-orgs"
    );
    const fd2 = new FormData();
    fd2.set("organizationId", "org_1");
    fd2.set("reason", "abuse");
    const ok = await suspendOk(null, fd2);
    expect(ok.ok).toBe(true);
    expect(suspendOrganization2).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        actorUserId: "sa_1",
        reason: "abuse",
      }),
    );
  });
});

describe("invite accept page", () => {
  it("exists and references acceptOrganizationInvitation", () => {
    const src = readFileSync(
      resolve("src/app/(auth)/invite/accept/page.tsx"),
      "utf8",
    );
    expect(src).toContain("acceptOrganizationInvitation");
    expect(src).toContain("/invite/accept");
    expect(src).toContain("rawToken");
  });
});

describe("billing profile schema strip", () => {
  it("OrganizationBillingProfile keeps ops email + billing state, no tax/address PII", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    const start = schema.indexOf("model OrganizationBillingProfile");
    expect(start).toBeGreaterThan(-1);
    const end = schema.indexOf("\nmodel ", start + 1);
    const block = schema.slice(start, end > 0 ? end : undefined);
    expect(block).toContain("billingEmail");
    expect(block).toContain("planCode");
    expect(block).toContain("billingStatus");
    expect(block).toContain("stripeCustomerId");
    expect(block).not.toContain("taxId");
    expect(block).not.toContain("addressLine1");
    expect(block).not.toContain("companyLegalName");
    expect(block).not.toContain("countryCode");
  });
});

describe("platform console navigation and account creation", () => {
  it("layout mounts persistent platform nav", () => {
    const layout = readFileSync(resolve("src/app/platform/layout.tsx"), "utf8");
    expect(layout).toContain("PlatformConsoleNav");
    expect(layout).toContain("requirePlatformOperator");
  });

  it("home links every admin area and audits routes", () => {
    const home = readFileSync(resolve("src/app/platform/page.tsx"), "utf8");
    expect(home).toContain("/platform/orgs");
    expect(home).toContain("/platform/orgs/new");
    expect(home).toContain("/platform/costs");
    expect(home).toContain("/platform/email-templates");
    expect(home).toContain("PLATFORM_ROUTE_AUDIT");
  });

  it("create account page invites first OWNER", () => {
    const page = readFileSync(
      resolve("src/app/platform/orgs/new/page.tsx"),
      "utf8",
    );
    expect(page).toContain("createPlatformOrganizationAction");
    expect(page).toContain("INDIVIDUAL");
    expect(page).toContain("ENTERPRISE");
    expect(page).toContain("ownerEmail");
  });

  it("schema has account type and billing status enums", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    expect(schema).toContain("enum OrganizationAccountType");
    expect(schema).toContain("enum BillingStatus");
    expect(schema).toContain("PLATFORM_ORGANIZATION_CREATED");
    expect(schema).toContain("ORGANIZATION_MEMBER_REMOVED");
  });

  it("org settings billing page is OWNER/ADMIN gated", () => {
    const page = readFileSync(
      resolve("src/app/(app)/settings/billing/page.tsx"),
      "utf8",
    );
    expect(page).toContain("requireOrgAdmin");
    expect(page).toContain("billing-stripe-hook");
    expect(page).toMatch(/account is free/i);
  });

  it("org detail includes member invite/remove and cost", () => {
    const detailPage = readFileSync(
      resolve("src/app/platform/orgs/[id]/page.tsx"),
      "utf8",
    );
    expect(detailPage).toContain("platformInviteUserAction");
    expect(detailPage).toContain("platformRemoveMemberAction");
    expect(detailPage).toContain("computeCostReport");
    expect(detailPage).toContain("Scoped customer view");
  });
});

describe("usage alert ledger uniqueness seam", () => {
  it("schema defines unique org+resource+period+threshold", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model UsageAlertLedger");
    expect(schema).toContain(
      "@@unique([organizationId, resource, periodKey, thresholdPercent])",
    );
    expect(schema).toContain("USAGE_LIMIT_WARNING");
    expect(schema).toContain("ACTIVE_COMPANY");
  });

  it("quota path calls usage alert helper after consume", () => {
    const quota = readFileSync(resolve("src/lib/usage/quota-service.ts"), "utf8");
    expect(quota).toContain("maybeFireUsageAlert");
    expect(quota).toContain("ACTIVE_COMPANY");
    expect(quota).toContain("EMAIL_GENERATION");
  });
});

describe("provision creates OWNER", () => {
  it("provision-service writes OWNER for new individual workspaces", () => {
    const src = readFileSync(
      resolve("src/lib/auth/provision-service.ts"),
      "utf8",
    );
    expect(src).toMatch(/role:\s*"OWNER"/);
    expect(src).toContain('membershipRole: "OWNER"');
    expect(src).not.toContain("companyLegalName");
  });
});

describe("platform org detail and scoped view", () => {
  it("detail shows lists, setup completeness, credits, and health", () => {
    const detailPage = readFileSync(
      resolve("src/app/platform/orgs/[id]/page.tsx"),
      "utf8",
    );
    expect(detailPage).toContain("Lists (");
    expect(detailPage).toContain("Setup completeness");
    expect(detailPage).toContain("Credit grants");
    expect(detailPage).toContain("Health (failure rates)");
    expect(detailPage).toContain("contactLists");
  });

  it("scoped view is read-only and audited, not impersonation", () => {
    const viewPage = readFileSync(
      resolve("src/app/platform/orgs/[id]/view/page.tsx"),
      "utf8",
    );
    expect(viewPage).toContain("Scoped read-only view");
    expect(viewPage).toContain("not impersonation");
    expect(viewPage).toContain("recordPlatformOrgView");
    expect(viewPage).not.toContain("suspendOrganizationAction");
    expect(viewPage).not.toContain("grantOrganizationCreditAction");
  });
});

describe("phase B cost reporting seams", () => {
  it("platform home is costs-aware (not a bare redirect)", () => {
    const home = readFileSync(resolve("src/app/platform/page.tsx"), "utf8");
    expect(home).not.toMatch(/redirect\(["']\/platform\/orgs["']\)/);
    expect(home).toContain("Costs");
    expect(home).toContain("getLatestSpendDrift");
    expect(home).toContain("computeCostReport");
  });

  it("costs page covers company cost, ratio, projections, rates, reconciliation", () => {
    const page = readFileSync(resolve("src/app/platform/costs/page.tsx"), "utf8");
    expect(page).toContain("Cost per company researched");
    expect(page).toContain("Contacts per company");
    expect(page).toContain("Projected monthly cost");
    expect(page).toContain("ensureAiModelRatesSeeded");
    expect(page).toContain("upsertAiModelRateAction");
    expect(page).toContain("recordSpendReconciliationAction");
  });

  it("schema has AiModelRate and ProviderSpendReconciliation", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model AiModelRate");
    expect(schema).toContain("model ProviderSpendReconciliation");
    expect(schema).toContain("AI_MODEL_RATE_CHANGED");
    expect(schema).toContain("PROVIDER_SPEND_RECONCILED");
  });
});

describe("invite accept sets active org and retires empty personal workspace", () => {
  it("acceptOrganizationInvitation updates activeOrganizationId and calls retire helper", () => {
    const src = readFileSync(resolve("src/lib/org/signup.ts"), "utf8");
    expect(src).toContain("export async function retireEmptyPersonalWorkspace");
    expect(src).toContain("activeOrganizationId: invitation.organizationId");
    expect(src).toContain(
      "retireEmptyPersonalWorkspace(user.id, invitation.organizationId)",
    );
    expect(src).toContain("keepOrganizationId");
  });

  it("logged-out invite accept page sets pending invite cookie", () => {
    const page = readFileSync(
      resolve("src/app/(auth)/invite/accept/page.tsx"),
      "utf8",
    );
    expect(page).toContain("PENDING_INVITE_COOKIE");
    expect(page).toContain("pending_invite_token");
    expect(page).toContain("cookies()");
  });
});
