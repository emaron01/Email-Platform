/**
 * Product URL page retrieval with SSRF-safe redirects.
 */

import {
  assertSafeExternalHttpUrl,
  safeFetchHttp,
} from "@/lib/research/url-safety";

export type FetchedPage = {
  url: string;
  title: string | null;
  text: string;
  ok: boolean;
  errorSafe?: string;
};

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

function htmlToTextSnippet(html: string, maxLen = 8000): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export async function fetchProductPageUrl(
  url: string,
  timeoutMs = 12_000,
): Promise<FetchedPage> {
  const initial = assertSafeExternalHttpUrl(url);
  if (!initial.ok) {
    return {
      url,
      title: null,
      text: "",
      ok: false,
      errorSafe: initial.reason,
    };
  }

  try {
    const response = await safeFetchHttp(initial.href, {
      method: "GET",
      timeoutMs,
      headers: {
        "User-Agent": "EmailPlatformProductResearch/1.0",
      },
    });

    if (!response.ok) {
      return {
        url: initial.href,
        title: null,
        text: "",
        ok: false,
        errorSafe: `URL returned HTTP ${response.status}.`,
      };
    }

    // Final URL after redirects must also be safe (already checked per hop).
    const finalUrl = response.url || initial.href;
    const finalSafe = assertSafeExternalHttpUrl(finalUrl);
    if (!finalSafe.ok) {
      return {
        url: initial.href,
        title: null,
        text: "",
        ok: false,
        errorSafe: finalSafe.reason,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain")
    ) {
      return {
        url: finalSafe.href,
        title: null,
        text: "",
        ok: false,
        errorSafe: "URL did not return HTML/text content.",
      };
    }
    const html = await response.text();
    const text = htmlToTextSnippet(html);
    if (!text) {
      return {
        url: finalSafe.href,
        title: extractTitle(html),
        text: "",
        ok: false,
        errorSafe: "Page contained no extractable text.",
      };
    }
    return {
      url: finalSafe.href,
      title: extractTitle(html),
      text,
      ok: true,
    };
  } catch (error) {
    return {
      url: initial.href,
      title: null,
      text: "",
      ok: false,
      errorSafe:
        error instanceof Error ? error.message.slice(0, 200) : "Could not retrieve URL.",
    };
  }
}
