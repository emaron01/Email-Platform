import { NextResponse } from "next/server";
import { runCadenceDigestJob } from "@/lib/cadence/digest";

/**
 * Cron entry point for weekday-morning cadence digests.
 * Schedule via Render cron or similar: POST with Authorization Bearer CRON_SECRET.
 * Example schedule: every 15 minutes on weekdays (adjust for user timezones).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const result = await runCadenceDigestJob();
  return NextResponse.json({ ok: true, ...result });
}
