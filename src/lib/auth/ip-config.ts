/**
 * Better Auth client-IP resolution for Render (and similar reverse proxies).
 *
 * Render terminates TLS and forwards the browser to the Node service. Client
 * identity arrives in X-Forwarded-For (and sometimes X-Real-IP). Better Auth
 * 1.7 rejects multi-value XFF unless trustedProxies is set; without a
 * resolvable IP, rate limiting collapses to one shared per-path bucket.
 *
 * Safety model:
 * - Prefer X-Forwarded-For, then X-Real-IP (single-value headers still work).
 * - trustedProxies lists only private/link-local/CGNAT CIDRs used as *proxy
 *   hops* on Render’s internal path — never public internet ranges.
 * - Better Auth walks the chain right→left, skips trusted hops, and takes the
 *   first untrusted hop as the client. Spoofed leftmost values cannot become
 *   the client when the rightmost hop is the trusted Render proxy.
 *
 * Override with BETTER_AUTH_TRUSTED_PROXIES (comma-separated IPs/CIDRs) if
 * Render’s topology differs.
 */
export const RENDER_TRUSTED_PROXY_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "127.0.0.1/32",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
] as const;

/** Header order: Render’s documented client IP carrier first. */
export const BETTER_AUTH_IP_ADDRESS_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
] as const;

export function resolveTrustedProxies(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string[] {
  const raw = env.BETTER_AUTH_TRUSTED_PROXIES?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...RENDER_TRUSTED_PROXY_CIDRS];
}

export function getBetterAuthIpAddressOptions(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): {
  ipAddressHeaders: string[];
  trustedProxies: string[];
} {
  return {
    ipAddressHeaders: [...BETTER_AUTH_IP_ADDRESS_HEADERS],
    trustedProxies: resolveTrustedProxies(env),
  };
}
