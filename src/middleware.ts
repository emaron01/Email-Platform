import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthEnv } from "@/lib/auth/config";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/verify-email",
  "/post-verify",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/api/auth",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Route protection edge.
 * Session cookie presence is a gate; authoritative membership checks happen server-side.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fail closed if production accidentally enables dev bypass.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEV_TENANT_BYPASS === "true"
  ) {
    return new NextResponse(
      "Misconfigured environment: ALLOW_DEV_TENANT_BYPASS is not allowed in production.",
      { status: 500 },
    );
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(.*)$/)
  ) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Legacy verification failures redirected to /?error=INVALID_TOKEN — never
  // show the Dashboard / DEV tenant fallback for those.
  if (
    pathname === "/" &&
    (request.nextUrl.searchParams.get("error") === "INVALID_TOKEN" ||
      request.nextUrl.searchParams.get("error") === "TOKEN_EXPIRED")
  ) {
    const dest = new URL("/verify-email", request.url);
    dest.searchParams.set(
      "error",
      request.nextUrl.searchParams.get("error") || "INVALID_TOKEN",
    );
    return NextResponse.redirect(dest);
  }

  const env = getAuthEnv();
  if (
    !env.isProduction &&
    env.allowDevTenantBypass &&
    env.devOrganizationId
  ) {
    return NextResponse.next();
  }

  const sessionCookie =
    request.cookies.get("better-auth.session_token") ||
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie?.value) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith("/platform")) {
    // Platform authorization enforced in page/server — cookie alone is insufficient.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
