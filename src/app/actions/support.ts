"use server";

import type { SupportTicketStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { assertRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import {
  requireCurrentUser,
  resolveActiveOrganization,
} from "@/lib/auth/session";
import { requirePlatformOperator } from "@/lib/auth/authz";
import { prisma } from "@/lib/prisma";
import {
  supportTicketConsoleBaseUrl,
  supportTicketNotificationEmail,
} from "@/lib/support/config";
import { sendTransactionalEmail } from "@/lib/transactional-email/send";

export type SupportActionResult = { ok: boolean; message: string };

const SUPPORT_STATUSES: SupportTicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "CLOSED",
];

function requiredText(
  formData: FormData,
  field: string,
  label: string,
  maxLength: number,
): string {
  const value = String(formData.get(field) || "").trim();
  if (!value) throw new Error(`${label} is required.`);
  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function safeSourcePath(value: FormDataEntryValue | null): string {
  const raw = String(value || "/").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return (raw.split(/[?#]/, 1)[0] || "/").slice(0, 500);
}

function submitterName(user: {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}): string | null {
  const parts = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || user.name?.trim() || null;
}

function safeActionError(error: unknown, fallback: string): string {
  if (error instanceof RateLimitError || error instanceof Error) {
    const message = error.message;
    if (message.length <= 180 && !message.includes("\n")) return message;
  }
  return fallback;
}

export async function createSupportTicketAction(
  _prev: SupportActionResult | null,
  formData: FormData,
): Promise<SupportActionResult> {
  try {
    const subject = requiredText(formData, "subject", "Subject", 120);
    const description = requiredText(
      formData,
      "description",
      "Description",
      5000,
    );
    const user = await requireCurrentUser();
    const context = await resolveActiveOrganization(user);
    const organization = context?.organization ?? null;

    await assertRateLimit({
      key: `support-ticket:user:${user.id}`,
      limit: 3,
      windowMs: 15 * 60 * 1000,
    });
    if (organization) {
      await assertRateLimit({
        key: `support-ticket:org:${organization.id}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
    }

    const [billing, requestHeaders] = await Promise.all([
      organization
        ? prisma.organizationBillingProfile.findUnique({
            where: { organizationId: organization.id },
            select: { planCode: true, billingStatus: true },
          })
        : null,
      headers(),
    ]);

    const ticket = await prisma.supportTicket.create({
      data: {
        organizationId: organization?.id ?? null,
        submittedByUserId: user.id,
        subject,
        description,
        sourcePath: safeSourcePath(formData.get("sourcePath")),
        userAgent:
          requestHeaders.get("user-agent")?.trim().slice(0, 1000) || null,
        organizationName:
          organization?.name.slice(0, 200) ?? "No active organization",
        submittedByName: submitterName(user)?.slice(0, 200) ?? null,
        submittedByEmail: user.email.slice(0, 320),
        planCode: billing?.planCode ?? null,
        billingStatus: billing?.billingStatus ?? null,
      },
      select: { id: true, organizationId: true, organizationName: true },
    });

    try {
      await sendTransactionalEmail({
        templateKey: "SUPPORT_TICKET_CREATED",
        to: supportTicketNotificationEmail(),
        variables: {
          firstName: "Support",
          ticketSubject: subject,
          workspaceName: ticket.organizationName,
          ticketUrl: `${supportTicketConsoleBaseUrl()}/platform/support/${ticket.id}`,
        },
        userId: user.id,
        organizationId: ticket.organizationId,
        idempotencyKey: `support-ticket-created:${ticket.id}`,
      });
    } catch (error) {
      console.error("[support-ticket] notification failed", {
        ticketId: ticket.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      ok: true,
      message:
        "Your support request was received. Someone will follow up.",
    };
  } catch (error) {
    return {
      ok: false,
      message: safeActionError(
        error,
        "Unable to submit your support request. Please try again.",
      ),
    };
  }
}

export async function updateSupportTicketStatusAction(
  _prev: SupportActionResult | null,
  formData: FormData,
): Promise<SupportActionResult> {
  try {
    const actor = await requirePlatformOperator();
    const ticketId = requiredText(formData, "ticketId", "Ticket", 100);
    const status = String(formData.get("status") || "") as SupportTicketStatus;
    if (!SUPPORT_STATUSES.includes(status)) {
      throw new Error("Select a valid ticket status.");
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status },
      select: { organizationId: true },
    });
    await recordAdminAuditEvent({
      action: "SUPPORT_TICKET_STATUS_CHANGED",
      actorUserId: actor.id,
      organizationId: ticket.organizationId,
      metadata: { ticketId, status },
    });
    revalidatePath("/platform/support");
    revalidatePath(`/platform/support/${ticketId}`);
    return { ok: true, message: "Ticket status updated." };
  } catch (error) {
    return {
      ok: false,
      message: safeActionError(error, "Unable to update ticket status."),
    };
  }
}

export async function addSupportTicketNoteAction(
  _prev: SupportActionResult | null,
  formData: FormData,
): Promise<SupportActionResult> {
  try {
    const actor = await requirePlatformOperator();
    const ticketId = requiredText(formData, "ticketId", "Ticket", 100);
    const body = requiredText(formData, "body", "Internal note", 5000);
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { organizationId: true },
    });
    if (!ticket) throw new Error("Support ticket not found.");

    await prisma.supportTicketNote.create({
      data: {
        supportTicketId: ticketId,
        authorUserId: actor.id,
        body,
      },
    });
    await recordAdminAuditEvent({
      action: "SUPPORT_TICKET_NOTE_ADDED",
      actorUserId: actor.id,
      organizationId: ticket.organizationId,
      metadata: { ticketId },
    });
    revalidatePath(`/platform/support/${ticketId}`);
    return { ok: true, message: "Internal note added." };
  } catch (error) {
    return {
      ok: false,
      message: safeActionError(error, "Unable to add internal note."),
    };
  }
}
