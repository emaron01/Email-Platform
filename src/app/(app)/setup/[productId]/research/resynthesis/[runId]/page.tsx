import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductResynthesisReview } from "@/components/ProductResynthesisReview";
import { PageHeader, TenantMissing } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { ProductDraft } from "@/lib/product-research/contract";
import { PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG } from "@/lib/product-research/resynthesize-approved";
import { productDraftFromApprovedProfile } from "@/lib/product-research/resynthesize-approved-plan";
import { getProduct } from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  params: Promise<{ productId: string; runId: string }>;
};

export default async function ProductResynthesisReviewPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { productId, runId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Re-synthesize product" />
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

  const run = await prisma.productSetupRun.findFirst({
    where: {
      id: runId,
      organizationId: organization.id,
      productId: product.id,
    },
  });
  if (!run) notFound();

  const userContext = run.userContextJson as Record<string, unknown> | null;
  if (!userContext?.[PRODUCT_RESYNTHESIS_USER_CONTEXT_FLAG]) {
    notFound();
  }

  const draft = (run.productDraftJson as ProductDraft | null) ?? null;
  const failed = run.status === "FAILED";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={`Re-synthesize: ${product.name}`}
        description="Review new material against your approved product profile. Nothing changes until you confirm."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
            >
              All products
            </Link>
            <Link
              href={`/setup/${product.id}/research`}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
            >
              Back to research
            </Link>
          </div>
        }
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <ProductResynthesisReview
          productId={product.id}
          productName={product.name}
          websiteUrl={product.websiteUrl}
          setupRunId={run.id}
          evidenceBundleId={run.evidenceBundleId}
          draft={draft}
          failed={failed}
          errorSafe={run.errorSafe}
          beforeProfile={productDraftFromApprovedProfile(product.profileJson)}
          manuallyEditedFields={product.manuallyEditedFields}
        />
      </section>
    </div>
  );
}
