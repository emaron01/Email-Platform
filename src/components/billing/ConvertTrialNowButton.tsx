"use client";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * POST /api/billing/end-trial — Stripe trial_end: 'now'.
 * Capacity unlocks after webhook sync, not from this client response alone.
 */
export function ConvertTrialNowButton({
  className,
  planLabel = "Standard",
  paidCompanyCapacityLabel = null,
}: {
  className?: string;
  /** Display name of the plan billing starts on (e.g. Team, Standard). */
  planLabel?: string;
  /** e.g. "300 companies" or "100 companies" — shown in confirm copy. */
  paidCompanyCapacityLabel?: string | null;
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
          Convert to {planLabel} now?
        </p>
        <p className="text-sm text-amber-950">
          This ends your trial immediately, charges your card today, and starts
          your {planLabel} billing cycle now
          {paidCompanyCapacityLabel
            ? ` with FULL ACCESS (${paidCompanyCapacityLabel})`
            : " with FULL ACCESS"}{" "}
          once Stripe confirms — usually a few seconds.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className={className ?? PRIMARY_BUTTON_CLASS}
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
                      `Trial ended. ${planLabel} billing starts today.`,
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
            className={SECONDARY_BUTTON_CLASS}
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
        className={className ?? PRIMARY_BUTTON_CLASS}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Convert to {planLabel} now
      </button>
      <p className="text-xs text-slate-600">
        Charges your card today and starts the {planLabel} billing cycle
        immediately
        {paidCompanyCapacityLabel ? ` (${paidCompanyCapacityLabel})` : ""}.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
