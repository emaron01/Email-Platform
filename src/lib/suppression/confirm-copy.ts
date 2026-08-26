/**
 * Node-safe confirmation copy for organization-wide email suppression.
 */
export function suppressionOptOutConfirmBody(): string {
  return [
    "This marks the email address as opted out for the entire organization.",
    "They will not receive generated or sent email, including sequence follow-ups.",
    "A later list upload of the same address stays visible but stays excluded until someone explicitly restores them.",
    "This is organization-wide and stays in effect until reversed.",
  ].join("\n");
}
