import { NextResponse } from "next/server";
import { handleStripeWebhookEvent } from "@/lib/billing/handle-stripe-webhook";
import { getStripe, getStripeWebhookSecret } from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  try {
    const result = await handleStripeWebhookEvent(event);
    return NextResponse.json({
      received: true,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error("stripe_webhook_handler_failed", {
      type: event.type,
      id: event.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
