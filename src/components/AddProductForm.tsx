"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { upsertProductAction } from "@/app/actions";
import { Field, PrimaryButton } from "@/components/ui";
import type { ProductActionResult } from "@/lib/product/save";

const initial: ProductActionResult | null = null;

export function AddProductForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    upsertProductAction,
    initial,
  );

  useEffect(() => {
    if (!state?.ok || !state.productId) return;
    router.push(`/setup/${state.productId}/edit`);
  }, [state, router]);

  const restored = state && !state.ok ? state.values : undefined;
  const formKey =
    state && !state.ok
      ? `product-create-fail-${state.message}-${restored?.name?.slice(0, 24) ?? ""}`
      : "product-create";

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 md:grid-cols-2"
    >
      {state ? (
        <p
          role="status"
          data-testid="product-action-status"
          className={
            state.ok
              ? "md:col-span-2 text-sm text-emerald-700"
              : "md:col-span-2 text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
      <input type="hidden" name="id" value="" />
      <Field
        label="Product Name"
        name="name"
        required
        defaultValue={restored?.name}
      />
      <Field
        label="Website URL"
        name="websiteUrl"
        placeholder="https://"
        defaultValue={restored?.websiteUrl}
      />
      <div className="md:col-span-2">
        <Field
          label="Product Description"
          name="description"
          as="textarea"
          defaultValue={restored?.description}
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="Primary Value Proposition"
          name="valueProposition"
          as="textarea"
          defaultValue={restored?.valueProposition}
        />
      </div>
      <Field
        label="Typical Price / AOV"
        name="averageOrderValue"
        type="number"
        defaultValue={restored?.averageOrderValue}
      />
      <div className="flex items-end">
        <PrimaryButton type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add Product"}
        </PrimaryButton>
      </div>
    </form>
  );
}
