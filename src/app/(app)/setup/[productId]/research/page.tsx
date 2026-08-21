import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AssistedProductIntake,
  ProductDraftReview,
  SuggestedPersonasPanel,
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
  PersonaDraft,
  ProductDraft,
  ProductMessagingDraft,
  SuggestedPersona,
} from "@/lib/product-research/contract";

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

  const [latestRun, latestBundle, urlStale, sourceCount] = await Promise.all([
    prisma.productSetupRun.findFirst({
      where: {
        organizationId: organization.id,
        productId: product.id,
        status: { in: ["NEEDS_REVIEW", "PARTIAL", "APPROVED"] },
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
  const suggestions =
    (latestRun?.suggestedPersonasJson as SuggestedPersona[] | null) ?? [];
  const personaDrafts =
    (latestRun?.personaDraftsJson as PersonaDraft[] | null) ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Research: ${product.name}`}
        description="Acquire evidence once. Review AI drafts. Saving makes Product and Personas authoritative."
        actions={
          <Link
            href={`/setup/${product.id}`}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Product setup
          </Link>
        }
      />

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

      {latestRun && suggestions.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <SuggestedPersonasPanel
            productId={product.id}
            setupRunId={latestRun.id}
            suggestions={suggestions}
            drafts={personaDrafts}
          />
        </section>
      ) : null}
    </div>
  );
}
