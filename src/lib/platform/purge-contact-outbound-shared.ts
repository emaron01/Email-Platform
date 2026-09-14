/**
 * Shared constants for contact/outbound selective purge (safe for client + server).
 */

export const CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE = "Purge contacts";

/** What the platform confirm dialog must name. */
export function contactOutboundPurgeConfirmSummary(): {
  deletes: string[];
  keeps: string[];
} {
  return {
    deletes: [
      "Contacts and contact lists",
      "Companies and company/contact research",
      "Scoring runs, scores, and title suggestions",
      "Campaigns, drafts, and send records",
      "Email suppressions (opt-out / bounce list)",
    ],
    keeps: [
      "Organization and users",
      "Products, ICPs, and personas",
      "Voice samples and email signatures",
      "Billing profile, credit packs, and referrals",
    ],
  };
}
