import { describe, expect, it } from "vitest";
import { grantedScopesIncludeMailSend } from "@/lib/mailbox/microsoft-config";
import {
  formatGraphProviderReason,
  parseMicrosoftGraphErrorBody,
} from "@/lib/mailbox/microsoft-graph";

describe("parseMicrosoftGraphErrorBody", () => {
  it("parses Graph nested error objects", () => {
    expect(
      parseMicrosoftGraphErrorBody({
        error: {
          code: "InvalidAuthenticationToken",
          message: "CompactToken parsing failed with error code: 80049217",
        },
      }),
    ).toEqual({
      code: "InvalidAuthenticationToken",
      message: "CompactToken parsing failed with error code: 80049217",
    });
  });

  it("parses OAuth-style string error + error_description", () => {
    expect(
      parseMicrosoftGraphErrorBody({
        error: "invalid_token",
        error_description: "The access token is invalid.",
      }),
    ).toEqual({
      code: "invalid_token",
      message: "The access token is invalid.",
    });
  });
});

describe("formatGraphProviderReason", () => {
  it("never returns null and includes status even when body is empty", () => {
    const reason = formatGraphProviderReason({
      status: 401,
      error: { code: null, message: null },
      wwwAuthenticate: 'Bearer realm="", error="invalid_token"',
      bodySnippet: null,
    });
    expect(reason).toContain("http=401");
    expect(reason).toContain("www-authenticate=");
    expect(reason.length).toBeGreaterThan(0);
  });

  it("includes Graph code and message when present", () => {
    const reason = formatGraphProviderReason({
      status: 401,
      error: {
        code: "InvalidAuthenticationToken",
        message: "Lifetime expired",
      },
      wwwAuthenticate: null,
      bodySnippet: null,
    });
    expect(reason).toBe(
      "http=401; code=InvalidAuthenticationToken; message=Lifetime expired",
    );
  });
});

describe("grantedScopesIncludeMailSend", () => {
  it("accepts full resource scope and short Mail.Send", () => {
    expect(
      grantedScopesIncludeMailSend([
        "openid",
        "https://graph.microsoft.com/Mail.Send",
      ]),
    ).toBe(true);
    expect(grantedScopesIncludeMailSend(["Mail.Send", "offline_access"])).toBe(
      true,
    );
    expect(grantedScopesIncludeMailSend(["openid", "profile"])).toBe(false);
    expect(grantedScopesIncludeMailSend(null)).toBe(false);
  });
});
