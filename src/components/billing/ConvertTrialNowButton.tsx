"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * POST /api/billing/end-trial — Stripe trial_end: 'now'.
 * Capacity unlocks after webhook sync, not from this client response alone.
 */
export function ConvertTrialNowButton({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (success) {
    return (
      <div className="space-y-1" data-testid="convert-trial-success">
        <p className="text-sm font-medium text-slate-900">{success}</p>
        <p className="text-xs text-slate-600">
          Refresh if capacity does not update within a minute.
        </p>
      </div>
    );
  }

  if (confirming) {
    return (
      <div
        className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3"
        data-testid="convert-trial-confirm"
      >
        <p className="text-sm font-medium text-amber-950">
          Convert to Standard now?
        </p>
        <p className="text-sm text-amber-950">
          This ends your trial immediately, charges your card today, and starts
          your Standard billing cycle now. You get 100 company research slots
          once Stripe confirms — usually a few seconds.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className={
              className ??
              "rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
            }
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const res = await fetch("/api/billing/end-trial", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                  });
                  const body = (await res.json().catch(() => ({}))) as {
                    message?: string;
                    error?: string;
                  };
                  if (!res.ok) {
                    setError(body.error ?? "Could not convert trial");
                    return;
                  }
                  setSuccess(
                    body.message ??
                      "Trial ended. Standard billing starts today.",
                  );
                  setConfirming(false);
                  window.setTimeout(() => router.refresh(), 2_500);
                  window.setTimeout(() => router.refresh(), 8_000);
                } catch {
                  setError("Could not convert trial");
                }
              });
            }}
          >
            {pending ? "Converting…" : "Charge card and convert"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        data-testid="convert-trial-now"
        className={
          className ??
          "rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
        }
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Convert to Standard now
      </button>
      <p className="text-xs text-slate-600">
        Charges your card today and starts the Standard billing cycle
        immediately.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
