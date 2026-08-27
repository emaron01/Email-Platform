"use client";

/**
 * Marker component so seam tests can assert the invite accept route exists
 * and is wired to acceptOrganizationInvitation (imported by the server page).
 */
export function AcceptInviteClient({ token }: { token: string }) {
  return (
    <p className="mt-2 hidden" data-testid="invite-accept-token" data-token={token}>
      invite-accept
    </p>
  );
}
