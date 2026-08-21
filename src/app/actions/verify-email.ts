"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { assertRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { normalizeEmail } from "@/lib/auth/provision-service";
import { VERIFICATION_CALLBACK_PATH } from "@/lib/auth/verification";

export type ResendVerificationResult =
  | { ok: true; message: string }
  | { ok: false; message: string; rateLimited?: boolean };

/**
 * Resend verification via Better Auth. Always returns a neutral success
 * message when possible (avoid account enumeration). Rate limited.
 */
export async function resendVerificationEmailAction(
  formData: FormData,
): Promise<ResendVerificationResult> {
  const raw = String(formData.get("email") || "").trim();
  if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  const email = normalizeEmail(raw);

  try {
    await assertRateLimit({
      key: `email-verify-resend:${email}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: false,
        rateLimited: true,
        message: "Too many attempts. Please wait and try again.",
      };
    }
    throw error;
  }

  try {
    await auth.api.sendVerificationEmail({
      body: {
        email,
        callbackURL: VERIFICATION_CALLBACK_PATH,
      },
      headers: await headers(),
    });
  } catch {
    // Swallow provider/user-not-found differences for enumeration safety.
  }

  return {
    ok: true,
    message:
      "If an account exists for that email, we've sent a verification link.",
  };
}
