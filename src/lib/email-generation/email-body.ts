export const EMAIL_SUBJECT_MAX_CHARS = 300;
export const EMAIL_BODY_MAX_CHARS = 50_000;

export const EMAIL_CLIENTS = [
  "OUTLOOK_WEB",
  "OUTLOOK_DESKTOP",
  "GMAIL_WEB",
] as const;
export type EmailClient = (typeof EMAIL_CLIENTS)[number];
export type EmailClientBodyHandling = "PREFILLED" | "COPIED";

/** Canonical storage and rendering format. Internal blank lines are preserved. */
export function normalizeEmailBody(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/** RFC-style text transport format used by mail clients and provider payloads. */
export function toEmailTransportBody(value: string): string {
  return normalizeEmailBody(value).replace(/\n/g, "\r\n");
}

export {
  EMAIL_SIGNATURE_HTML_MAX_CHARS,
  EMAIL_SIGNATURE_MAX_CHARS,
} from "@/lib/signature/types";

/**
 * Append a plain-text signature for deeplink handoff. Drafts stay unsigned.
 * Idempotent if the body already ends with the signature.
 */
export function appendEmailSignature(
  body: string,
  signature: string | null | undefined,
): string {
  const normalizedBody = normalizeEmailBody(body)
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+$/, "");
  const normalizedSig = signature
    ? normalizeEmailBody(signature).trim()
    : "";
  if (!normalizedSig) return normalizeEmailBody(body);
  if (
    normalizedBody === normalizedSig ||
    normalizedBody.endsWith(`\n\n${normalizedSig}`) ||
    normalizedBody.endsWith(`\n${normalizedSig}`)
  ) {
    return normalizedBody;
  }
  return `${normalizedBody}\n\n${normalizedSig}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Plain draft body as HTML fragments (escaped + <br>), for Graph when an HTML
 * signature requires contentType HTML. Does not invent styling beyond line breaks.
 */
export function plainTextBodyToHtmlFragments(value: string): string {
  return escapeHtml(toEmailTransportBody(value)).replace(
    /\r\n|\n|\r/g,
    "<br>\r\n",
  );
}

/**
 * Graph /me/sendMail payload.
 *
 * - No HTML signature → contentType Text (plain cold body + optional plain sig).
 * - HTML signature → contentType HTML wrapping escaped plain body + signature HTML.
 *   Graph accepts only one ItemBody; Exchange typically emits multipart/alternative
 *   (text/plain + text/html) on the wire from that HTML body.
 */
export function buildMicrosoftGraphSendMailPayload(input: {
  to: string;
  subject: string;
  /** Plain draft body without signature. */
  body: string;
  signatureText?: string | null;
  signatureHtml?: string | null;
}): {
  message: {
    subject: string;
    body:
      | { contentType: "Text"; content: string }
      | { contentType: "HTML"; content: string };
    toRecipients: Array<{ emailAddress: { address: string } }>;
  };
  saveToSentItems: true;
} {
  const signatureHtml = input.signatureHtml?.trim() || "";
  if (signatureHtml) {
    const bodyHtml = plainTextBodyToHtmlFragments(input.body);
    const content = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>${bodyHtml}<br>\r\n<br>\r\n${signatureHtml}</body></html>`;
    return {
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
      saveToSentItems: true,
    };
  }

  const textBody = appendEmailSignature(input.body, input.signatureText);
  return {
    message: {
      subject: input.subject,
      body: {
        contentType: "Text",
        content: toEmailTransportBody(textBody),
      },
      toRecipients: [{ emailAddress: { address: input.to } }],
    },
    saveToSentItems: true,
  };
}

export function buildMailtoHref(input: {
  to: string;
  subject: string;
  body: string;
}): string {
  const subject = encodeURIComponent(input.subject);
  const body = encodeURIComponent(toEmailTransportBody(input.body));
  return `mailto:${encodeURIComponent(input.to)}?subject=${subject}&body=${body}`;
}

function buildEmailClientHref(input: {
  client: EmailClient;
  to: string;
  subject: string;
  body?: string;
}): string {
  const to = encodeURIComponent(input.to);
  const subject = encodeURIComponent(input.subject);
  const body =
    input.body == null
      ? null
      : encodeURIComponent(toEmailTransportBody(input.body));
  if (input.client === "OUTLOOK_WEB") {
    return `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}${body == null ? "" : `&body=${body}`}`;
  }
  if (input.client === "GMAIL_WEB") {
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}${body == null ? "" : `&body=${body}`}`;
  }
  return `mailto:${to}?subject=${subject}${body == null ? "" : `&body=${body}`}`;
}

export function buildEmailClientLaunch(input: {
  client: EmailClient;
  to: string;
  subject: string;
  body: string;
  maxUrlLength: number;
}): {
  href: string | null;
  bodyHandling: EmailClientBodyHandling;
  bodyToCopy: string | null;
} {
  const hrefWithBody = buildEmailClientHref(input);
  if (hrefWithBody.length <= input.maxUrlLength) {
    return {
      href: hrefWithBody,
      bodyHandling: "PREFILLED",
      bodyToCopy: null,
    };
  }
  const hrefWithoutBody = buildEmailClientHref({
    client: input.client,
    to: input.to,
    subject: input.subject,
  });
  if (hrefWithoutBody.length > input.maxUrlLength) {
    return { href: null, bodyHandling: "COPIED", bodyToCopy: input.body };
  }
  return {
    href: hrefWithoutBody,
    bodyHandling: "COPIED",
    bodyToCopy: normalizeEmailBody(input.body),
  };
}

/**
 * Open a compose deeplink exactly once.
 *
 * Do not use `window.open(href, "_blank", "noopener,noreferrer")` and then fall
 * back on a null return: with `noopener`, modern browsers always return `null`
 * even when the window opened, so a `location.assign` fallback double-fires
 * (two Outlook desktop compose windows for mailto; new tab + same-tab for
 * Outlook Web / Gmail).
 */
export function openEmailClientHref(href: string): void {
  if (typeof window === "undefined") return;
  if (href.startsWith("mailto:")) {
    window.location.assign(href);
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.referrerPolicy = "no-referrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
