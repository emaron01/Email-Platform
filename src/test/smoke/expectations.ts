export type SmokeExpectation = {
  /** Substring(s); any match in the final HTML body passes. */
  mustInclude: string | string[];
  /** When true, request without session cookie (public page). */
  public?: boolean;
};

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/verify-email",
  "/post-verify",
  "/forgot-password",
  "/reset-password",
  "/invite",
] as const;

export function isPublicSmokeRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const ROUTE_EXPECTATIONS: Record<string, SmokeExpectation> = {
  "/login": { mustInclude: "Sign in", public: true },
  "/signup": { mustInclude: "Create account", public: true },
  "/verify-email": { mustInclude: "verify-email-page", public: true },
  "/post-verify": {
    mustInclude: [
      "data-testid=\"app-sidebar\"",
      "verify-email-page",
    ],
  },
  "/forgot-password": { mustInclude: "Forgot password", public: true },
  "/reset-password": { mustInclude: "Reset password", public: true },
  "/invite/accept": { mustInclude: "Sign in", public: true },
  "/": { mustInclude: "data-testid=\"app-sidebar\"" },
  "/campaigns": { mustInclude: "Campaigns" },
  "/campaigns/new": { mustInclude: "New campaign" },
  "/contacts": { mustInclude: "Contacts" },
  "/icps": { mustInclude: "ICPs" },
  "/icps/new": { mustInclude: "New ICP" },
  "/lists": { mustInclude: "Lists" },
  "/personas": { mustInclude: "Personas" },
  "/personas/new": { mustInclude: "New persona" },
  "/products": { mustInclude: "Products" },
  "/products/new": { mustInclude: "data-testid=\"assisted-product-intake\"" },
  "/settings": { mustInclude: "Settings" },
  "/settings/account": { mustInclude: "Account Settings" },
  "/settings/billing": { mustInclude: "billing-stripe-hook" },
  "/settings/cadence": { mustInclude: "Email cadence" },
  "/settings/email": { mustInclude: "email-signature" },
  "/settings/organization": { mustInclude: "Organization" },
  "/settings/usage": { mustInclude: "Usage" },
  "/settings/voice": { mustInclude: "email-signature" },
  "/setup": { mustInclude: "Products" },
  "/setup/new": { mustInclude: "New Product" },
  "/no-workspace": { mustInclude: "data-testid=\"app-sidebar\"" },
  "/platform": { mustInclude: "data-testid=\"platform-console-nav\"" },
  "/platform/orgs": { mustInclude: "Organizations" },
  "/platform/orgs/new": { mustInclude: "Create account" },
  "/platform/costs": { mustInclude: "Costs" },
  "/platform/email-templates": { mustInclude: "Email templates" },
};

function expectationForCampaignChild(pathname: string): SmokeExpectation | null {
  if (!pathname.startsWith("/campaigns/")) return null;
  if (pathname.endsWith("/score")) return null;
  return { mustInclude: "Campaign" };
}

function expectationForSetupChild(pathname: string): SmokeExpectation | null {
  if (!pathname.startsWith("/setup/")) return null;
  if (pathname.includes("/research/resynthesis/")) {
    return { mustInclude: "product-resynthesis-review" };
  }
  if (pathname.includes("/rebuild/")) {
    return { mustInclude: "persona-resynthesis-review" };
  }
  if (pathname.includes("/personas/new")) {
    return { mustInclude: "Build Persona" };
  }
  if (pathname.includes("/personas/manage/")) {
    return { mustInclude: "Persona" };
  }
  if (pathname.includes("/personas/")) {
    return { mustInclude: "Persona" };
  }
  if (pathname.includes("/icps/new")) {
    return { mustInclude: "Add ICP" };
  }
  if (pathname.includes("/icps/")) {
    return { mustInclude: "ICP" };
  }
  if (pathname.includes("/research")) {
    return { mustInclude: "Research:" };
  }
  if (pathname.endsWith("/edit")) {
    return { mustInclude: "Edit:" };
  }
  return { mustInclude: "Product" };
}

export function smokeExpectationForPath(pathname: string): SmokeExpectation {
  const exact = ROUTE_EXPECTATIONS[pathname];
  if (exact) return exact;

  const campaign = expectationForCampaignChild(pathname);
  if (campaign) return campaign;

  const setup = expectationForSetupChild(pathname);
  if (setup) return setup;

  if (pathname.startsWith("/lists/") && pathname.endsWith("/score")) {
    return { mustInclude: "Create Scoring Run" };
  }
  if (pathname.startsWith("/lists/")) {
    return { mustInclude: "List" };
  }
  if (pathname.startsWith("/companies/")) {
    return { mustInclude: "Company briefing" };
  }
  if (pathname.startsWith("/scoring/")) {
    return { mustInclude: "Score Report" };
  }
  if (pathname.startsWith("/platform/orgs/") && pathname.endsWith("/view")) {
    return { mustInclude: "data-testid=\"platform-console-nav\"" };
  }
  if (pathname.startsWith("/platform/orgs/")) {
    return { mustInclude: "Organization" };
  }

  return { mustInclude: "data-testid=\"app-sidebar\"" };
}
