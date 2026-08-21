"use client";

import Link from "next/link";
import { FormEvent, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const sent = searchParams.get("sent") === "1";
  const [message, setMessage] = useState<string | null>(
    sent
      ? "Check your inbox for a verification link. If it did not arrive, you can resend below."
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onResend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get("email") || "");
    try {
      const res = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always neutral to avoid account enumeration where possible.
      setMessage(
        "If an account exists for that email, we've sent a verification link.",
      );
      if (!res.ok && res.status === 429) {
        setError("Too many attempts. Please wait and try again.");
      }
    } catch {
      setError("Unable to send verification email right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Verify your email
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Confirm your email to unlock research, invitations, and billing
        settings.
      </p>
      {message ? (
        <p className="mt-4 text-sm text-emerald-700">{message}</p>
      ) : null}
      <form onSubmit={onResend} className="mt-6 space-y-4">
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Sending…" : "Resend verification email"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
