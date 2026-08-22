import Link from "next/link";
import { notFound } from "next/navigation";
import type { Product } from "@prisma/client";
import type { ReactNode } from "react";
import { deleteProductAction } from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { PageHeader, Panel, TenantMissing } from "@/components/ui";
import { listIcpCriteria } from "@/lib/interpretation/icp";
import { listPersonaCriteria } from "@/lib/interpretation/persona";
import { getProduct, listIcps, listPersonas } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { prisma } from "@/lib/prisma";
import {
  formatLikelyTitles,
  formatPersonaCriteriaSummary,
  normalizeSuggestedBuyerRoles,
  partitionSuggestedRoles,
  productCompletionLabel,
  productCompletionState,
  summarizePersonaCriteriaCounts,
  truncateText,
} from "@/lib/setup/product-overview";

type PageProps = {
  params: Promise<{ productId: string }>;
};

function statusBadgeClass(state: ReturnType<typeof productCompletionState>) {
  if (state === "approved") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }
  if (state === "needs_review") {
    return "bg-amber-50 text-amber-900 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function ActionLink({
  href,
  children,
  primary,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
          : "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      }
    >
      {children}
    </Link>
  );
}

export default async function SetupProductPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Product" description="Manage product setup." />
        <TenantMissing />
      </div>
    );
  }

  let product: Product;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const [icps, personas, impact, latestRun] = await Promise.all([
    listIcps(product.id),
    listPersonas(product.id),
    prisma.product.findFirst({
      where: { id: product.id, organizationId: organization.id },
      include: {
        _count: {
          select: {
            icps: true,
            personas: true,
            campaigns: true,
            scoringRuns: true,
            sources: true,
            evidenceBundles: true,
            setupRuns: true,
          },
        },
      },
    }),
    prisma.productSetupRun.findFirst({
      where: {
        organizationId: organization.id,
        productId: product.id,
        status: { in: ["NEEDS_REVIEW", "PARTIAL", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
      select: { suggestedPersonasJson: true },
    }),
  ]);

  const productDeleteBody = (() => {
    const c = impact?._count;
    if (!c) return "This will permanently delete this Product.";
    const lines = [
      `Delete Product "${product.name}"?`,
      "",
      "This will also remove:",
      `• ${c.icps} ICP(s)`,
      `• ${c.personas} Persona(s) and their current criteria`,
      `• ${c.sources} product source(s)`,
      `• ${c.evidenceBundles} evidence bundle(s)`,
      `• ${c.setupRuns} research draft run(s)`,
      "",
      c.scoringRuns > 0
        ? `Note: ${c.scoringRuns} scoring run(s) reference this Product — it will be archived instead of permanently deleted so historical snapshots remain.`
        : "Historical scoring snapshots (if any later) would be preserved via archive rather than hard delete.",
      c.campaigns > 0
        ? `Blocked until ${c.campaigns} campaign(s) are removed or reassigned.`
        : "Campaigns: none currently reference this Product.",
    ];
    return lines.join("\n");
  })();

  const personaCriteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listPersonaCriteria>>
  >();
  const icpCriteriaMap = new Map<
    string,
    Awaited<ReturnType<typeof listIcpCriteria>>
  >();
  await Promise.all([
    ...personas.map(async (persona) => {
      personaCriteriaMap.set(
        persona.id,
        await listPersonaCriteria(organization.id, persona.id),
      );
    }),
    ...icps.map(async (icp) => {
      icpCriteriaMap.set(icp.id, await listIcpCriteria(organization.id, icp.id));
    }),
  ]);

  const suggestedRoles = normalizeSuggestedBuyerRoles(
    latestRun?.suggestedPersonasJson,
  );
  const { unbuiltSuggestions } = partitionSuggestedRoles({
    savedPersonas: personas,
    suggestedRoles,
  });

  const completion = productCompletionState(product);
  const productBlurb = truncateText(
    product.description || product.valueProposition,
    140,
  );
  const primaryIcp = icps[0] ?? null;
  const primaryIcpCriteria = primaryIcp
    ? (icpCriteriaMap.get(primaryIcp.id) ?? [])
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={product.name}
        description="Track setup progress. Edit details only when you choose to."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/setup/${product.id}/research`}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Research & Build
            </Link>
            <Link
              href="/setup"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              All products
            </Link>
          </div>
        }
      />

      <div className="space-y-5">
        {/* 1. Product */}
        <Panel
          title="1. Product"
          description="Core product record used by research and scoring."
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-slate-900">
                  {product.name}
                </p>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(completion)}`}
                >
                  {productCompletionLabel(completion)}
                </span>
              </div>
              {productBlurb ? (
                <p className="mt-2 text-sm text-slate-600">{productBlurb}</p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  No description yet.
                </p>
              )}
            </div>
            <ActionLink href={`/setup/${product.id}/edit`}>
              Edit product
            </ActionLink>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <ConfirmDeleteForm
              action={deleteProductAction}
              hiddenFields={{ id: product.id }}
              triggerLabel="Delete product"
              confirmTitle={`Delete Product "${product.name}"?`}
              confirmBody={productDeleteBody}
              confirmButtonLabel="Delete Product"
              onSuccessNavigate="/setup"
            />
          </div>
        </Panel>

        {/* 2. Personas */}
        <Panel
          title="2. Personas"
          description="Saved buyers and suggested roles still available to build."
        >
          <div className="space-y-5">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Saved personas
              </h4>
              {personas.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  None saved yet. Build a suggested role or add a custom persona.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {personas.map((persona) => {
                    const summary = summarizePersonaCriteriaCounts(
                      personaCriteriaMap.get(persona.id) ?? [],
                    );
                    const titles = formatLikelyTitles(persona.targetTitles);
                    return (
                      <li
                        key={persona.id}
                        className="flex flex-wrap items-start justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            {persona.name}
                          </p>
                          {titles ? (
                            <p className="mt-0.5 text-sm text-slate-500">
                              {titles}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-500">
                            {formatPersonaCriteriaSummary(summary)}
                          </p>
                        </div>
                        <ActionLink
                          href={`/setup/${product.id}/personas/manage/${persona.id}`}
                        >
                          Edit
                        </ActionLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Suggested roles not yet built
              </h4>
              {unbuiltSuggestions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  {suggestedRoles.length === 0
                    ? "No suggested roles from product research yet."
                    : "All suggested roles have been built."}
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {unbuiltSuggestions.map((role) => (
                    <li
                      key={role.suggestionKey}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{role.name}</p>
                        {role.whyThisRoleMatters ? (
                          <p className="mt-0.5 text-sm text-slate-500">
                            {truncateText(role.whyThisRoleMatters, 120)}
                          </p>
                        ) : null}
                      </div>
                      <ActionLink
                        href={`/setup/${product.id}/personas/new?role=${encodeURIComponent(role.suggestionKey)}`}
                        primary
                      >
                        Build Persona
                      </ActionLink>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <ActionLink href={`/setup/${product.id}/personas/manage/new`}>
                  Add custom persona
                </ActionLink>
              </div>
            </div>
          </div>
        </Panel>

        {/* 3. ICP */}
        <Panel
          title="3. ICP"
          description="Ideal customer profile for company-level fit."
        >
          {primaryIcp ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{primaryIcp.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {truncateText(
                    primaryIcp.definition || primaryIcp.description,
                    140,
                  ) || "No definition yet."}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {primaryIcpCriteria.length} criteria
                  {icps.length > 1 ? ` · ${icps.length} ICPs total` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionLink href={`/setup/${product.id}/icps/${primaryIcp.id}`}>
                  Edit
                </ActionLink>
                {icps.length > 1 ? (
                  <ActionLink href={`/setup/${product.id}/icps`}>
                    View all
                  </ActionLink>
                ) : (
                  <ActionLink href={`/setup/${product.id}/icps/new`}>
                    Add ICP
                  </ActionLink>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-4">
              <p className="text-sm font-semibold text-amber-950">
                ICP not set up yet
              </p>
              <p className="mt-1 text-sm text-amber-900/80">
                Add an ideal customer profile so company-level scoring has a
                target. You can do this before or after building personas.
              </p>
              <div className="mt-3">
                <ActionLink href={`/setup/${product.id}/icps/new`} primary>
                  Add ICP
                </ActionLink>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
