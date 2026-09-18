import { PageHeader, Panel } from "@/components/ui";
import { SupportTicketForm } from "@/components/SupportTicketForm";

function safeSourcePath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return (value.split(/[?#]/, 1)[0] || "/").slice(0, 500);
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Support"
        description="Tell us what happened and someone will follow up."
      />
      <Panel
        title="Submit a support request"
        description="Your workspace, account, billing state, current page, and browser details are included automatically."
      >
        <SupportTicketForm sourcePath={safeSourcePath(from)} />
      </Panel>
    </div>
  );
}
