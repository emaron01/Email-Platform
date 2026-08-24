import { MailboxConnectionPanel } from "@/components/MailboxConnectionPanel";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMailboxConnectionView } from "@/lib/mailbox/data";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  searchParams: Promise<{ mailbox?: string; error?: string }>;
};

function noticeFor(query: { mailbox?: string; error?: string }): string | null {
  if (query.mailbox === "connected") {
    return "Microsoft 365 mailbox connected.";
  }
  if (query.error === "admin_consent_required") {
    return "Your tenant requires administrator consent. Ask your Microsoft 365 administrator to approve the delegated Mail.Send permission for this app, then reconnect.";
  }
  if (query.error === "connection_declined") {
    return "Microsoft connection was canceled. Connect again when you are ready.";
  }
  if (query.error === "reconnect_required") {
    return "The connection request expired or was invalid. Start the connection again.";
  }
  if (query.error) {
    return "Microsoft 365 could not be connected. Check the app registration and try again.";
  }
  return null;
}

export default async function EmailSettingsPage({ searchParams }: PageProps) {
  const [user, organization, query] = await Promise.all([
    requireCurrentUser(),
    requireOrganization(),
    searchParams,
  ]);
  const connection = await getMailboxConnectionView({
    organizationId: organization.id,
    userId: user.id,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Email connection
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Connect a personal mailbox for direct sending. Connections belong to
          you within this workspace and cannot be used by another member.
        </p>
      </div>
      <MailboxConnectionPanel
        connection={
          connection
            ? {
                status: connection.status,
                mailboxAddress: connection.mailboxAddress,
                connectedAt: connection.connectedAt.toISOString(),
              }
            : null
        }
        notice={noticeFor(query)}
      />
    </div>
  );
}
