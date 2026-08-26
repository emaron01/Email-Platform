/**
 * Safe CRUD delete/archive result messages (Node-safe).
 */

import { TenantError } from "@/lib/tenant/errors";

export type CrudDeleteResult = {
  ok: boolean;
  message: string;
  mode?: "deleted" | "archived" | "unarchived";
  productId?: string;
  personaId?: string;
};

export function toSafeCrudDeleteError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error && error.name === "AuthorizationError") {
    return error.message;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("foreign key") || msg.includes("restrict")) {
      return "This item could not be deleted because related records still reference it.";
    }
  }
  return "Delete failed. Please try again.";
}
