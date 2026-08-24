export const EMAIL_SUBJECT_MAX_CHARS = 300;
export const EMAIL_BODY_MAX_CHARS = 50_000;

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
