import Link from "next/link";
import { AddProductForm } from "@/components/AddProductForm";
import { PageHeader, TenantMissing } from "@/components/ui";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function NewProductPage() {
  const organization = await getCurrentOrganization();

  if (!organization) {
    return (
      <div>
        <PageHeader
          title="New product"
          description="Create a product for the active organization."
        />
        <TenantMissing />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="New product"
        description="Start with a name, or use assisted setup to research and build from URLs, notes, paste, or uploads."
        actions={
          <Link
            href="/products"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            Back to products
          </Link>
        }
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <Link
            href="/setup/new"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
          >
            Assisted product setup
          </Link>
        </div>
        <AddProductForm />
      </section>
    </div>
  );
}
