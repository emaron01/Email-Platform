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

  return (
    <div>
      <PageHeader
        title="ICPs"
        description="Org-wide ICP list. Open an ICP to review criteria or attach it to a campaign."
        actions={
          productId ? (
            <Link
              href={`/setup/${productId}/icps/new`}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
            >
              Add ICP
            </Link>
          ) : null
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
          description={
            productId
              ? "Add an ICP for this product, or clear the filter to see other products."
              : "Create a product first, then define ICPs from the product setup flow."
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
