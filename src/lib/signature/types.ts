export const EMAIL_SIGNATURE_MAX_CHARS = 2_000;
export const EMAIL_SIGNATURE_HTML_MAX_CHARS = 20_000;

export type EmailSignatureView = {
  body: string;
  htmlBody: string | null;
  active: boolean;
  updatedAt: string;
};

export type EmailSignatureForSend = {
  /** Plain text for deeplink / Graph text path. */
  text: string | null;
  /** Sanitized HTML for Connected Send only. */
  html: string | null;
};
