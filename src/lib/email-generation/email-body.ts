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
