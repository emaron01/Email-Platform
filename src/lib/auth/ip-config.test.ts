/**
 * Render / Better Auth IP resolution — rate limits must not collapse to one bucket.
 */
import { describe, expect, it } from "vitest";
import {
  createRateLimitKey,
  getIP,
  getIPFromHeader,
} from "@better-auth/core/utils/ip";
import {
  BETTER_AUTH_IP_ADDRESS_HEADERS,
  getBetterAuthIpAddressOptions,
  RENDER_TRUSTED_PROXY_CIDRS,
  resolveTrustedProxies,
} from "@/lib/auth/ip-config";

describe("Better Auth IP config for Render", () => {
  it("uses X-Forwarded-For first and trusts private proxy hops by default", () => {
    const opts = getBetterAuthIpAddressOptions({});
    expect(opts.ipAddressHeaders[0]).toBe("x-forwarded-for");
    expect(opts.ipAddressHeaders).toEqual([...BETTER_AUTH_IP_ADDRESS_HEADERS]);
    expect(opts.trustedProxies).toEqual([...RENDER_TRUSTED_PROXY_CIDRS]);
  });

  it("allows BETTER_AUTH_TRUSTED_PROXIES override", () => {
    expect(
      resolveTrustedProxies({ BETTER_AUTH_TRUSTED_PROXIES: "203.0.113.10, 10.0.0.0/8" }),
    ).toEqual(["203.0.113.10", "10.0.0.0/8"]);
  });

  it("resolves distinct client IPs from multi-hop XFF (does not share one bucket)", () => {
    const { trustedProxies, ipAddressHeaders } = getBetterAuthIpAddressOptions({});

    const headersA = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.1.2.3",
    });
    const headersB = new Headers({
      "x-forwarded-for": "198.51.100.20, 10.1.2.3",
    });

    const reqA = new Request("https://app.example/api/auth/sign-in/email", {
      headers: headersA,
    });
    const reqB = new Request("https://app.example/api/auth/sign-in/email", {
      headers: headersB,
    });

    const ipA = getIP(reqA, {
      advanced: { ipAddress: { ipAddressHeaders, trustedProxies } },
    });
    const ipB = getIP(reqB, {
      advanced: { ipAddress: { ipAddressHeaders, trustedProxies } },
    });

    expect(ipA).toBe("203.0.113.10");
    expect(ipB).toBe("198.51.100.20");
    expect(ipA).not.toBe(ipB);

    const path = "/sign-in/email";
    const keyA = createRateLimitKey(ipA!, path);
    const keyB = createRateLimitKey(ipB!, path);
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toContain("no-trusted-ip");
    expect(keyB).not.toContain("no-trusted-ip");
  });

  it("without trustedProxies, multi-hop XFF cannot resolve (shared-bucket failure mode)", () => {
    const multi = getIPFromHeader("203.0.113.10, 10.1.2.3", {
      trustedProxies: [],
    });
    expect(multi).toBeNull();

    const single = getIPFromHeader("203.0.113.10", { trustedProxies: [] });
    expect(single).toBe("203.0.113.10");
  });
});
