import type { Product } from "@prisma/client";
import { upsertProductAction } from "@/app/actions";
import { Field, SubmitButton } from "@/components/ui";

/** Existing product edit form — same fields and upsertProductAction as before. */
export function ProductDetailsForm({ product }: { product: Product }) {
  return (
    <form action={upsertProductAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={product.id} />
      <Field label="Product Name" name="name" defaultValue={product.name} required />
      <Field
        label="Website URL"
        name="websiteUrl"
        defaultValue={product.websiteUrl}
        placeholder="https://"
      />
      <div className="md:col-span-2">
        <Field
          label="Product Description"
          name="description"
          defaultValue={product.description}
          as="textarea"
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="Primary Value Proposition"
          name="valueProposition"
          defaultValue={product.valueProposition}
          as="textarea"
        />
      </div>
      <Field
        label="Typical Price / AOV"
        name="averageOrderValue"
        type="number"
        defaultValue={
          product.averageOrderValue != null
            ? Number(product.averageOrderValue)
            : ""
        }
      />
      <div className="flex items-end">
        <SubmitButton>Save product</SubmitButton>
      </div>
    </form>
  );
}
