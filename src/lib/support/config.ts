import "server-only";

export function supportTicketNotificationEmail(): string {
  const email = process.env.SUPPORT_TICKET_NOTIFICATION_EMAIL?.trim();
  if (!email) {
    throw new Error("SUPPORT_TICKET_NOTIFICATION_EMAIL is required.");
  }
  return email;
}

export function supportTicketConsoleBaseUrl(): string {
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!base) {
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required.");
  }
  return base.replace(/\/$/, "");
}
