"use client";

import { useState, useTransition } from "react";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { referralShareMessage } from "@/lib/billing/referral-share-message";
import { cn } from "@/lib/utils";

/**
 * Lazy referral section — Stripe promo code is created only when opened.
 * Copy code / copy message only — no mailto or in-app send.
 */
export function ReferralProgramPanel({
  enabled,
}: {
  /** Individual accounts only. */
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [rewardPercent, setRewardPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKind, setCopiedKind] = useState<"code" | "message" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (!enabled) return null;

  function loadCode() {
    setError(null);
    setOpen(true);
    if (code) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/referral-code", {
          method: "POST",
          headers: { Accept: "application/json" },
        });
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
          successfulReferralCount?: number;
          rewardPercent?: number;
          error?: string;
        };
        if (!res.ok || !body.code) {
          setError(body.error ?? "Could not load referral code");
          return;
        }
        setCode(body.code);
        setMessage(referralShareMessage(body.code));
        setCount(body.successfulReferralCount ?? 0);
        setRewardPercent(body.rewardPercent ?? 0);
      } catch {
        setError("Could not load referral code");
      }
    });
  }

  async function copyText(kind: "code" | "message", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKind(kind);
      window.setTimeout(() => setCopiedKind(null), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return (
    <section
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="billing-referral-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-slate-900">Referrals</h2>
          <p className="mt-1 text-sm text-slate-600">
            Share your code. Friends get 10% off Standard at Checkout. You earn
            10% off per successful referral, up to 50%.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={loadCode}
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            data-testid="billing-referral-open"
          >
            Show my referral code
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-3">
          {pending && !code ? (
            <p className="text-sm text-slate-600">Creating your code…</p>
          ) : null}
          {error ? (
            <p className="text-sm text-red-700" role="status">
              {error}
            </p>
          ) : null}
          {code ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold tracking-wide text-slate-900"
                  data-testid="billing-referral-code"
                >
                  {code}
                </code>
                <button
                  type="button"
                  className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
                  data-testid="billing-referral-copy-code"
                  onClick={() => copyText("code", code)}
                >
                  {copiedKind === "code" ? "Copied" : "Copy code"}
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Suggested message
                  <span className="ml-1 font-normal text-slate-500">
                    — edit before copying if you want
                  </span>
                </label>
                <AutosizeTextarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  minRows={4}
                  data-testid="billing-referral-message"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2"
                />
                <button
                  type="button"
                  className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
                  data-testid="billing-referral-copy-message"
                  onClick={() => copyText("message", message)}
                >
                  {copiedKind === "message" ? "Copied" : "Copy message"}
                </button>
              </div>

              <p
                className="text-sm text-slate-700"
                data-testid="billing-referral-stats"
              >
                {count ?? 0} successful referral
                {(count ?? 0) === 1 ? "" : "s"} · your rate{" "}
                {rewardPercent ?? 0}% off
                {(rewardPercent ?? 0) >= 50 ? " (capped)" : ""}
              </p>
              <p className="text-xs text-slate-500">
                A referral counts when they reach an active paid subscription —
                not at trial start. Your discount stays if they cancel later.
                Paste into Slack, email, or text — there is no in-app send.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
