"use client";

import { useState, useTransition } from "react";

/**
 * Starts STANDARD Checkout (allow_promotion_codes enabled server-side).
 */
export function StartStandardCheckoutButton({
  disabledReason,
}: {
  disabledReason?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabledReason) {
    return (
      <p className="text-sm text-slate-600" data-testid="billing-stripe-hook">
        {disabledReason}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="billing-stripe-hook">
      <button
        type="button"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { Accept: "application/json" },
              });
              const body = (await res.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
              };
              if (!res.ok || !body.url) {
                setError(body.error ?? "Could not start Checkout");
                return;
              }
              window.location.assign(body.url);
            } catch {
              setError("Could not start Checkout");
            }
          });
        }}
      >
        {pending ? "Redirecting…" : "Start Standard trial"}
      </button>
      <p className="text-xs text-slate-500">
        Card required for a 7-day trial. You can enter a promotion code on the
        Stripe Checkout page. Card details stay in Stripe.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
