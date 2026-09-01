import Link from "next/link";
import { deleteProductAction } from "@/app/actions";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import type { ProductWithCounts } from "@/lib/tenant/data";

export function ProductCatalogPanel({
  products,
  deleteSuccessNavigate = "/products",
}: {
  products: ProductWithCounts[];
  deleteSuccessNavigate?: string;
}) {
  return (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
      {products.map((product) => (
        <div
          key={product.id}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
        >
          <div>
            <p className="font-medium text-slate-900">{product.name}</p>
            <p className="mt-1 text-sm text-slate-600">
              {product.approvalStatus.replaceAll("_", " ")} ·{" "}
              {product._count.icps} ICP
              {product._count.icps === 1 ? "" : "s"} ·{" "}
              {product._count.personas} Persona
              {product._count.personas === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/setup/${product.id}/research`}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Research
            </Link>
            <Link
              href={`/setup/${product.id}`}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Manage
            </Link>
            <ConfirmDeleteForm
              action={deleteProductAction}
              hiddenFields={{ id: product.id }}
              triggerLabel="Delete"
              confirmTitle={`Delete Product "${product.name}"?`}
              confirmBody={`This will remove this Product and its ICPs (${product._count.icps}), Personas (${product._count.personas}), and product research sources/drafts.\nCampaigns (${product._count.campaigns}) must be removed first if any exist.\nHistorical scoring snapshots will not be destroyed — the Product may be archived instead if scoring runs reference it.`}
              confirmButtonLabel="Delete Product"
              onSuccessNavigate={deleteSuccessNavigate}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
