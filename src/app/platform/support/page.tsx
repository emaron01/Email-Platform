import Link from "next/link";
import { requirePlatformOperator } from "@/lib/auth/authz";
import { prisma } from "@/lib/prisma";

function statusLabel(status: string): string {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "CLOSED") return "Closed";
  return "Open";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function PlatformSupportPage() {
  await requirePlatformOperator();
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { notes: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Support tickets
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Newest first. Notes in this console are internal.
        </p>
      </div>

      <div className="space-y-4">
        {tickets.map((ticket) => (
          <article
            key={ticket.id}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/platform/support/${ticket.id}`}
                  className="font-semibold text-slate-900 underline underline-offset-2"
                >
                  {ticket.subject}
                </Link>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {ticket.description}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {statusLabel(ticket.status)}
              </span>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-slate-500">Organization</dt>
                <dd className="font-medium text-slate-800">
                  {ticket.organizationId ? (
                    <Link
                      href={`/platform/orgs/${ticket.organizationId}`}
                      className="underline"
                    >
                      {ticket.organizationName}
                    </Link>
                  ) : (
                    ticket.organizationName
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">User</dt>
                <dd className="break-all text-slate-800">
                  {ticket.submittedByName
                    ? `${ticket.submittedByName} · `
                    : ""}
                  {ticket.submittedByEmail}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Submitted</dt>
                <dd className="text-slate-800">{formatDate(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Page</dt>
                <dd className="break-all font-mono text-slate-800">
                  {ticket.sourcePath}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Plan / billing</dt>
                <dd className="text-slate-800">
                  {ticket.planCode ?? "Unknown"} /{" "}
                  {ticket.billingStatus ?? "Unknown"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Internal notes</dt>
                <dd className="text-slate-800">{ticket._count.notes}</dd>
              </div>
              {ticket.userAgent ? (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-slate-500">Browser user agent</dt>
                  <dd className="break-all font-mono text-slate-700">
                    {ticket.userAgent}
                  </dd>
                </div>
              ) : null}
            </dl>
          </article>
        ))}
        {tickets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-600">
            No support tickets yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
