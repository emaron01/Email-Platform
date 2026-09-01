"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ProductContinuePicker({
  products,
  initialProductId,
  continueHref,
  continueLabel,
}: {
  products: Array<{ id: string; name: string }>;
  initialProductId: string | null;
  continueHref: (productId: string) => string;
  continueLabel: string;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(initialProductId ?? "");

  useEffect(() => {
    if (productId) return;
    if (initialProductId) {
      setProductId(initialProductId);
      return;
    }
    if (products.length === 1) {
      setProductId(products[0]!.id);
    }
  }, [initialProductId, productId, products]);

  return (
    <div className="space-y-4">
      <label className="block text-sm text-slate-700">
        <span className="mb-2 block font-medium text-slate-900">Product</span>
        <select
          className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">Select a product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!productId}
        onClick={() => {
          if (!productId) return;
          router.push(continueHref(productId));
        }}
        className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {continueLabel}
      </button>
    </div>
  );
}
