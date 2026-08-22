import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AssistedProductIntake,
  ProductDraftReview,
  SuggestedBuyerRolesPanel,
} from "@/components/AssistedProductSetup";
import { PageHeader, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { productUrlResearchIsStale } from "@/lib/product-research/acquire";
import type {
  ProductDraft,
  ProductMessagingDraft,
} from "@/lib/product-research/contract";
import { normalizeSuggestedBuyerRoles } from "@/lib/setup/product-overview";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function ProductResearchPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Product research" />
        <TenantMissing />
      </div>
    );
  }

  let product;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const [latestRun, latestFailedRun, latestBundle, urlStale, sourceCount] =
    await Promise.all([
      prisma.productSetupRun.findFirst({
        where: {
          organizationId: organization.id,
          productId: product.id,
          status: { in: ["NEEDS_REVIEW", "PARTIAL", "APPROVED"] },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.productSetupRun.findFirst({
        where: {
          organizationId: organization.id,
          productId: product.id,
          status: "FAILED",
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.productEvidenceBundle.findFirst({
        where: { organizationId: organization.id, productId: product.id },
        orderBy: { version: "desc" },
      }),
      productUrlResearchIsStale({
        organizationId: organization.id,
        productId: product.id,
      }),
      prisma.productSource.count({
        where: {
          organizationId: organization.id,
          productId: product.id,
          status: { in: ["ACQUIRED", "EXTRACTED"] },
        },
      }),
    ]);

  const draft = (latestRun?.productDraftJson as ProductDraft | null) ?? null;
  const messaging =
    (latestRun?.messagingDraftJson as ProductMessagingDraft | null) ?? null;
  const roles = normalizeSuggestedBuyerRoles(latestRun?.suggestedPersonasJson);

  const showSynthesisFailure =
    !draft &&
    Boolean(latestBundle) &&
    (product.setupStatus === "FAILED" || Boolean(latestFailedRun));

  const productApproved = product.approvalStatus === "APPROVED";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Research: ${product.name}`}
        description="Research the Product once. Approve it. Then build Personas one at a time."
        actions={
          <Link
            href={`/setup/${product.id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Product setup
          </Link>
        }
      />

      {showSynthesisFailure ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-medium">Product synthesis could not be completed.</p>
          <p className="mt-1">
            Acquired evidence was preserved. Use Retry Synthesis — no URL
            re-fetch or Product web search.
          </p>
          {latestFailedRun?.errorSafe ? (
            <p className="mt-2 text-xs text-amber-800/80">
              {latestFailedRun.errorSafe}
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <AssistedProductIntake
          productId={product.id}
          defaultName={product.name}
          defaultUrl={product.websiteUrl ?? undefined}
          urlResearchStale={urlStale}
          latestEvidenceBundleId={latestBundle?.id}
        />
      </section>

      {latestRun && draft ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <ProductDraftReview
            productId={product.id}
            setupRunId={latestRun.id}
            productName={product.name}
            websiteUrl={product.websiteUrl}
            sourceCount={sourceCount}
            draft={draft}
            messaging={messaging}
          />
        </section>
      ) : null}

      {latestRun || productApproved ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <SuggestedBuyerRolesPanel
            productId={product.id}
            productApproved={productApproved}
            roles={roles}
          />
        </section>
      ) : null}
    </div>
  );
}
