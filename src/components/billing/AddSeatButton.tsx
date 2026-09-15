"use client";

import { useState } from "react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

export function AddSeatButton({
  disabled,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (disabled || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/seats", { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unable to add a seat.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Unable to add a seat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        title={disabled ? (disabledReason ?? undefined) : undefined}
        className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
      >
        {pending ? "Adding seat…" : "Add a seat"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {disabled && disabledReason ? (
        <p className="text-xs text-slate-500">{disabledReason}</p>
      ) : null}
    </div>
  );
}
