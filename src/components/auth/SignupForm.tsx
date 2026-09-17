"use client";

import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import { prepareSignupCompanyAction } from "@/app/actions/pending-signup";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SignupForm({
  next,
  planSummary,
  requirePlan,
}: {
  next: string;
  planSummary: string | null;
  requirePlan: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const firstName = String(fd.get("firstName") || "").trim();
    const lastName = String(fd.get("lastName") || "").trim();
    const companyName = String(fd.get("companyName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirmPassword") || "");

    if (companyName.length < 2) {
      setError("Company name is required.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    setLoading(true);
    try {
      const prepared = await prepareSignupCompanyAction({ companyName });
      if (!prepared.ok) {
        setError(prepared.message);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          callbackURL: "/post-verify",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(
          data.error?.message ||
            data.message ||
            "Unable to create account. Please try again.",
        );
        setLoading(false);
        return;
      }
      router.push(
        next
          ? `/verify-email?sent=1&next=${encodeURIComponent(next)}`
          : "/verify-email?sent=1",
      );
      router.refresh();
    } catch {
      setError("Unable to create account. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      data-testid="signup-form"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Create your account
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {planSummary
          ? `Selected: ${planSummary}. Enter your details to continue.`
          : "Enter your details to join the workspace."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            First name
            <input
              name="firstName"
              required
              autoComplete="given-name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Last name
            <input
              name="lastName"
              required
              autoComplete="family-name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <label className="block text-sm">
          Company name
          <input
            name="companyName"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Work email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Confirm password
          <input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading || (requirePlan && !planSummary)}
          className={cn(PRIMARY_BUTTON_CLASS, "w-full", "!px-3")}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{" "}
        <Link
          href={
            next
              ? `/login?next=${encodeURIComponent(next)}`
              : "/login"
          }
          className="font-medium underline"
        >
          Sign in
        </Link>
      </p>
      {!next ? (
        <p className="mt-2 text-sm text-slate-600">
          Want a different plan?{" "}
          <Link href="/signup/plan" className="font-medium underline">
            Change plan
          </Link>
        </p>
      ) : null}
    </div>
  );
}
