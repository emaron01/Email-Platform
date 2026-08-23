import Link from "next/link";
import { deleteProductAction } from "@/app/actions";
import { AddProductForm } from "@/components/AddProductForm";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import {
  EmptyState,
  PageHeader,
  Panel,
  TenantMissing,
} from "@/components/ui";
import { listProductsWithCounts } from "@/lib/tenant/data";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function SetupPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="Setup"
          description="Define products, then attach ICPs and personas to each product."
        />
        <TenantMissing />
      </div>
    );
  }

  const products = await listProductsWithCounts();

  return (
    <div>
      <PageHeader
        title="Setup"
        description="Products are reusable. Each product has its own ICPs and personas. Offers are defined later on each campaign."
      />

      <div className="space-y-6">
        <Panel
          title="Products"
          description="Create a product once, then manage the ICPs and personas that belong to it."
        >
          {products.length === 0 ? (
            <EmptyState
              title="No products yet"
              description="Add your first product to start defining ICPs and personas."
            />
          ) : (
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                >
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
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
                      onSuccessNavigate="/setup"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Add Product"
          description="Start with a name. Optionally research & build from URLs, notes, paste, or uploads."
        >
          <div className="mb-4">
            <Link
              href="/setup/new"
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
            >
              Assisted Product Setup
            </Link>
          </div>
          <AddProductForm />
        </Panel>
      </div>
    </div>
  );
}
