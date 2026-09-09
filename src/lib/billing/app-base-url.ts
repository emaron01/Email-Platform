/**
 * Public app origin for Stripe return URLs.
 * Always APP_URL / NEXT_PUBLIC_APP_URL — never request.url (internal hosts).
 */
export function billingAppBaseUrl(): string {
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!base) {
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required for Stripe redirects");
  }
  return base.replace(/\/$/, "");
}
