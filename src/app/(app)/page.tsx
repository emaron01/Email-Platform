import Link from "next/link";
import { PageHeader, TenantMissing } from "@/components/ui";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getHomeWorkflow, type SetupCardState } from "@/lib/workflow/home";

function SetupCard({
  number,
  title,
  state,
}: {
  number: number;
  title: string;
  state: SetupCardState;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {number} {title}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {state.label}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            state.done
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {state.done ? "Done" : "Not started"}
        </span>
      </div>
      <p className="mt-2 min-h-10 text-sm text-slate-600">{state.detail}</p>
      <Link
        href={state.href}
        className="mt-4 inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
      >
        {state.actionLabel}
      </Link>
    </section>
  );
}

function HomeNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
    >
      {label}
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const [organization, user] = await Promise.all([
    getCurrentOrganization(),
    getCurrentUser(),
  ]);
  const query = await searchParams;
  const includeArchived = query.archived === "1";

  if (!organization) {
    if (user?.platformRole === "SUPER_ADMIN") {
      redirect("/settings/account");
    }
    if (user) {
      redirect("/no-workspace");
    }
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Organization-scoped overview of lists, contacts, and campaigns."
        />
        <TenantMissing />
      </div>
    );
  }

  const workflow = await getHomeWorkflow(organization.id, { includeArchived });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={workflow.setupComplete ? "Campaigns" : "Get set up"}
        description={
          workflow.setupComplete
            ? `Work campaigns for ${organization.name} from qualification through sending.`
            : "Complete Product, ICP, and Personas before starting a campaign."
        }
        actions={
          <>
            <ShowArchivedToggle
              href={includeArchived ? "/" : "/?archived=1"}
              includeArchived={includeArchived}
              label="campaigns"
            />
            <HomeNavLink href="/lists" label="Lists" />
            <HomeNavLink href="/campaigns" label="Campaigns" />
          </>
        }
      />

      {!workflow.setupComplete ? (
        <div className="grid gap-4 md:grid-cols-3">
          <SetupCard number={1} title="Product" state={workflow.product} />
          <SetupCard number={2} title="ICP" state={workflow.icp} />
          <SetupCard number={3} title="Personas" state={workflow.personas} />
        </div>
      ) : (
        <section className="mb-7 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              1 Product
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              Approved · {workflow.product.suggestedRoleCount} buyer roles
              suggested
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              2 ICP
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {workflow.icp.count > 1
                ? `${workflow.icp.count} saved`
                : `${workflow.icp.name} · ${workflow.icp.criterionCount} criteria · ${workflow.icp.needsLookupCount} needs lookup`}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              3 Personas
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {workflow.personas.names.length} saved ·{" "}
              {workflow.personas.names.join(", ")}
            </p>
          </div>
        </section>
      )}

      <div className="mt-8 mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Campaigns</h2>
        {workflow.setupComplete ? (
          <Link
            href="/campaigns?new=1"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            New campaign
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="Finish setup first"
            className="cursor-not-allowed rounded-md bg-slate-300 px-3 py-2 text-sm font-medium text-slate-500"
          >
            New campaign
          </button>
        )}
      </div>
      {!workflow.setupComplete ? (
        <p className="mb-4 text-sm text-slate-500">
          Campaign creation unlocks after an approved Product, an ICP with
          criteria, and a saved Persona exist for the same product. Existing
          campaigns stay available.
        </p>
      ) : null}
      {workflow.campaigns.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="font-semibold text-slate-900">
            {workflow.setupComplete
              ? "Start your first campaign"
              : "No campaigns yet"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {workflow.setupComplete
              ? "Select the setup you already approved, then attach a list."
              : "Finish setup to create a campaign."}
          </p>
          {workflow.setupComplete ? (
            <Link
              href="/campaigns?new=1"
              className="mt-4 inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              New campaign
            </Link>
          ) : null}
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {workflow.campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {campaign.name}
                    {campaign.archived ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Archived
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {campaign.context || "Campaign setup"}
                  </p>
                </div>
                {campaign.emailsToWrite > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800">
                    {campaign.emailsToWrite} to write
                  </span>
                ) : null}
              </div>
              <dl className="mt-5 grid grid-cols-4 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Companies</dt>
                  <dd className="font-semibold">{campaign.companies}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Qualified</dt>
                  <dd className="font-semibold">{campaign.qualified}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Contacts</dt>
                  <dd className="font-semibold">{campaign.contacts}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Emails to write</dt>
                  <dd className="font-semibold">{campaign.emailsToWrite}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
