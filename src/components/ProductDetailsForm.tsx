"use client";

import { useState } from "react";
import type { Product } from "@prisma/client";
import { upsertProductAction } from "@/app/actions";
import { Field, SubmitButton } from "@/components/ui";
import { productNameDomainMismatchWarning } from "@/lib/setup/product-overview";

/** Existing product edit form — same fields and upsertProductAction as before. */
export function ProductDetailsForm({ product }: { product: Product }) {
  const [name, setName] = useState(product.name);
  const [websiteUrl, setWebsiteUrl] = useState(product.websiteUrl ?? "");
  const warning = productNameDomainMismatchWarning(name, websiteUrl);

  return (
    <form action={upsertProductAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={product.id} />
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Product Name</span>
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Website URL</span>
        <input
          name="websiteUrl"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
        />
      </label>
      {warning ? (
        <p
          role="status"
          data-testid="product-name-domain-warning"
          className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {warning}
        </p>
      ) : null}
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
