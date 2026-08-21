/**
 * Next.js server-only boundary for Better Auth.
 * Authoritative configuration lives in better-auth.ts (Node-safe, shared with CLI).
 */
import "server-only";

export { auth, getSupportEmail } from "@/lib/auth/better-auth";
export type { AuthSession } from "@/lib/auth/better-auth";
