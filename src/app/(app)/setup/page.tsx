import Link from "next/link";
import {
  deleteProductAction,
  upsertProductAction,
} from "@/app/actions";
import {
  EmptyState,
  Field,
  PageHeader,
  Panel,
  PrimaryButton,
  SecondaryButton,
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
                      href={`/setup/${product.id}`}
                      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Manage
                    </Link>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <SecondaryButton type="submit">Delete</SecondaryButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Add Product" description="Products are organization-scoped and reusable across campaigns.">
          <form action={upsertProductAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value="" />
            <Field label="Product Name" name="name" required />
            <Field label="Website URL" name="websiteUrl" placeholder="https://" />
            <div className="md:col-span-2">
              <Field label="Product Description" name="description" as="textarea" />
            </div>
            <div className="md:col-span-2">
              <Field
                label="Primary Value Proposition"
                name="valueProposition"
                as="textarea"
              />
            </div>
            <Field label="Typical Price / AOV" name="averageOrderValue" type="number" />
            <div className="flex items-end">
              <PrimaryButton type="submit">Add Product</PrimaryButton>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
