import Link from "next/link";
import { Suspense } from "react";
import { ArtifactProductFilter } from "@/components/ArtifactProductFilter";
import { EmptyState, PageHeader, TenantMissing } from "@/components/ui";
import { listIcps, listProducts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function IcpsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const query = await searchParams;
  const productId = query.product?.trim() || null;

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="ICPs"
          description="Ideal customer profiles across your products."
        />
        <TenantMissing />
      </div>
    );
  }

  const [products, icps] = await Promise.all([
    listProducts(),
    listIcps(productId ?? undefined),
  ]);
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const canCreate = products.length > 0;

  return (
    <div>
      <PageHeader
        title="ICPs"
        description="Org-wide ICP list. Open an ICP to review criteria or attach it to a campaign."
        actions={
          canCreate ? (
            <Link
              href={
                productId ? `/icps/new?product=${productId}` : "/icps/new"
              }
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
            >
              New ICP
            </Link>
          ) : (
            <span
              title="Add a product first"
              className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-slate-300 px-3.5 py-2 text-sm font-medium text-slate-500"
            >
              New ICP
            </span>
          )
        }
      />

      <div className="mb-6">
        <Suspense fallback={null}>
          <ArtifactProductFilter
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            selectedProductId={productId}
          />
        </Suspense>
      </div>

      {icps.length === 0 ? (
        <EmptyState
          title="No ICPs yet"
          description="An ICP defines who you sell to — natural-language criteria interpreted for scoring and campaigns."
          actions={
            canCreate ? (
              <Link
                href="/icps/new"
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                New ICP
              </Link>
            ) : (
              <Link
                href="/products/new"
                className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                New product
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">ICP</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {icps.map((icp) => (
                <tr key={icp.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/setup/${icp.productId}/icps/${icp.id}`}
                      className="hover:underline"
                    >
                      {icp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {productNameById.get(icp.productId) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/setup/${icp.productId}/icps/${icp.id}`}
                      className="text-slate-700 underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
