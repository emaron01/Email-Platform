import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import {
  acceptOrganizationInvitation,
  InvitationError,
} from "@/lib/org/signup";
import { AcceptInviteClient } from "./AcceptInviteClient";

/**
 * Invitation accept landing for `/invite/accept?token=...`.
 * Public route (middleware allowlist). Logged-in users accept immediately;
 * others are prompted to log in / sign up and return with the token.
 */
async function AcceptInviteBody({ token }: { token: string | null }) {
  if (!token) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Invalid invitation
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This invitation link is missing a token. Ask your workspace admin to
          resend the invite.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    const next = `/invite/accept?token=${encodeURIComponent(token)}`;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Accept invitation
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in or create an account with the invited email to join the
          workspace.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="rounded-md bg-slate-900 px-3 py-2 font-medium text-white"
          >
            Sign in
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-800"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  try {
    await acceptOrganizationInvitation({
      rawToken: token,
      acceptingUserId: user.id,
    });
  } catch (error) {
    const message =
      error instanceof InvitationError
        ? error.message
        : "Unable to accept this invitation.";
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Invitation problem
        </h1>
        <p className="mt-2 text-sm text-red-600" role="alert">
          {message}
        </p>
        <p className="mt-4 text-sm">
          <Link href="/" className="underline">
            Go home
          </Link>
        </p>
        <AcceptInviteClient token={token} />
      </div>
    );
  }

  redirect("/");
}

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const token = params.token?.trim() || null;

  return (
    <Suspense>
      <AcceptInviteBody token={token} />
    </Suspense>
  );
}
